import {
  GpsCoordinate,
  HandoverStep,
  MapPoint,
  ParentNotification,
  ParentNotificationPrefs,
  RouteDefinition,
  RouteStop,
  SafetyAlert,
  ShiftMode,
  StopEtaEstimate,
  StudentRecord,
  TrafficEtaWeightProfile,
  TrafficLevel,
  VehicleTelemetry,
  WeightedEtaConfidence,
} from '../types/safari';
import { SCHOOL_CAMPUS_POINT } from '../data/syntheticData';

export const BASE_STOP_DWELL_MIN = 1.2;

/**
 * Traffic-adaptive weighting profiles for the telemetry ETA engine.
 * - `scheduleWeight + liveSpeedWeight === 1.0` for every TrafficLevel.
 * - Under `clear` traffic, historical schedule baseline carries primary weight (0.65).
 * - Under `moderate` and `heavy` traffic, live observed vehicle kinematics and congestion
 *   buffers take increasing authority (0.55 and 0.70) while stop-merge dwell time scales up.
 */
export const TRAFFIC_ETA_WEIGHTS: Record<TrafficLevel, TrafficEtaWeightProfile> = {
  clear: {
    congestionMultiplier: 1.0,
    speedFactor: 1.0,
    scheduleWeight: 0.65,
    liveSpeedWeight: 0.35,
    dwellMultiplier: 1.0,
    minEffectiveSpeedKmh: 20,
    windowPaddingMin: 1,
  },
  moderate: {
    congestionMultiplier: 1.35,
    speedFactor: 0.74,
    scheduleWeight: 0.45,
    liveSpeedWeight: 0.55,
    dwellMultiplier: 1.3,
    minEffectiveSpeedKmh: 14,
    windowPaddingMin: 2,
  },
  heavy: {
    congestionMultiplier: 1.85,
    speedFactor: 0.48,
    scheduleWeight: 0.3,
    liveSpeedWeight: 0.7,
    dwellMultiplier: 1.65,
    minEffectiveSpeedKmh: 10,
    windowPaddingMin: 3,
  },
};

export const TRAFFIC_MULTIPLIERS: Record<TrafficLevel, number> = {
  clear: TRAFFIC_ETA_WEIGHTS.clear.congestionMultiplier,
  moderate: TRAFFIC_ETA_WEIGHTS.moderate.congestionMultiplier,
  heavy: TRAFFIC_ETA_WEIGHTS.heavy.congestionMultiplier,
};

export const TRAFFIC_SPEED_FACTORS: Record<TrafficLevel, number> = {
  clear: TRAFFIC_ETA_WEIGHTS.clear.speedFactor,
  moderate: TRAFFIC_ETA_WEIGHTS.moderate.speedFactor,
  heavy: TRAFFIC_ETA_WEIGHTS.heavy.speedFactor,
};

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function distanceBetween(a: MapPoint, b: MapPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Projects synthetic canvas coordinates (0..960, 0..600) into realistic
 * synthetic GPS coordinates (fictional school district corridor).
 */
export function toSyntheticGpsCoords(point: MapPoint): GpsCoordinate {
  const lat = Number((-1.227 - (point.y / 600) * 0.072).toFixed(4));
  const lng = Number((36.763 + (point.x / 960) * 0.115).toFixed(4));
  return { lat, lng };
}

export function formatGpsCoords(coords: GpsCoordinate): string {
  return `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
}

/**
 * Interpolates a position and heading along a polyline given normalized progress in [0, 1].
 * In afternoon shift, the bus travels in reverse from School Campus -> neighborhood stops.
 */
export function interpolateAlongWaypoints(
  waypoints: MapPoint[],
  progress: number,
  shift: ShiftMode
): { position: MapPoint; headingDeg: number } {
  const ordered = shift === 'morning' ? waypoints : [...waypoints].reverse();
  if (ordered.length === 0) {
    return { position: { x: 0, y: 0 }, headingDeg: 0 };
  }
  if (ordered.length === 1) {
    return { position: ordered[0], headingDeg: 0 };
  }

  const clamped = clamp(progress, 0, 1);
  const segLengths: number[] = [];
  let totalLength = 0;
  for (let i = 0; i < ordered.length - 1; i++) {
    const len = distanceBetween(ordered[i], ordered[i + 1]);
    segLengths.push(len);
    totalLength += len;
  }

  if (totalLength === 0) {
    return { position: ordered[0], headingDeg: 0 };
  }

  const targetDist = clamped * totalLength;
  let accumulated = 0;

  for (let i = 0; i < segLengths.length; i++) {
    const segLen = segLengths[i];
    if (accumulated + segLen >= targetDist || i === segLengths.length - 1) {
      const localT = segLen === 0 ? 0 : clamp((targetDist - accumulated) / segLen, 0, 1);
      const start = ordered[i];
      const end = ordered[i + 1];
      const x = start.x + (end.x - start.x) * localT;
      const y = start.y + (end.y - start.y) * localT;
      const headingDeg = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
      return { position: { x, y }, headingDeg };
    }
    accumulated += segLen;
  }

  const last = ordered[ordered.length - 1];
  return { position: last, headingDeg: 0 };
}

/**
 * Returns route stops ordered according to morning (pickup -> school) or afternoon (school -> dropoff),
 * with normalized progress along the current shift direction.
 */
export function getOrderedStopsForShift(
  route: RouteDefinition,
  shift: ShiftMode
): Array<RouteStop & { shiftProgress: number }> {
  if (shift === 'morning') {
    return route.stops.map((s) => ({
      ...s,
      shiftProgress: s.progressAtStop,
    }));
  }

  return [...route.stops]
    .reverse()
    .map((s) => ({
      ...s,
      shiftProgress: clamp(1 - s.progressAtStop, 0, 1),
    }));
}

/**
 * Weighted ETA calculation algorithm driven by the route's live `TrafficLevel`,
 * observed vehicle telemetry speed, intermediate stop dwell times, operational delays,
 * and GPS signal health.
 */
export function calculateWeightedStopEta(
  route: RouteDefinition,
  vehicle: Pick<
    VehicleTelemetry,
    'progress' | 'speedKmh' | 'state' | 'delayMinutes' | 'gpsSignalStrength'
  >,
  stopId: string,
  shift: ShiftMode
): StopEtaEstimate {
  const profile = TRAFFIC_ETA_WEIGHTS[route.trafficLevel] ?? TRAFFIC_ETA_WEIGHTS.clear;
  const orderedStops = getOrderedStopsForShift(route, shift);
  const stop = orderedStops.find((s) => s.id === stopId);

  const buildZeroResult = (hasPassedStop: boolean, isAtStop: boolean): StopEtaEstimate => ({
    etaMinutes: 0,
    baseMinutes: 0,
    trafficDeltaMinutes: 0,
    distanceKm: 0,
    hasPassedStop,
    isAtStop,
    weightedBreakdown: {
      trafficLevel: route.trafficLevel,
      scheduleWeight: profile.scheduleWeight,
      liveSpeedWeight: profile.liveSpeedWeight,
      scheduleComponentMin: 0,
      kinematicComponentMin: 0,
      dwellMinutes: 0,
      intermediateStopCount: 0,
      delayPenaltyMin: 0,
      gpsBufferMin: 0,
      etaWindowMin: [0, 0],
      confidence: 'high',
    },
  });

  if (!stop) {
    return buildZeroResult(false, false);
  }

  const progressDiff = stop.shiftProgress - vehicle.progress;

  if (progressDiff < -0.025) {
    return buildZeroResult(true, false);
  }

  if (Math.abs(progressDiff) <= 0.025) {
    return buildZeroResult(false, true);
  }

  const exactDistanceKm = progressDiff * route.totalDistanceKm;
  const distanceKm = Number(exactDistanceKm.toFixed(1));

  // Count intermediate stops strictly between current vehicle progress and target stop
  const intermediateStopCount = orderedStops.filter(
    (s) =>
      s.id !== stop.id &&
      s.shiftProgress > vehicle.progress + 0.025 &&
      s.shiftProgress < stop.shiftProgress - 0.01
  ).length;

  // 1. Free-flow baseline duration (clear traffic reference, including clear stop dwell)
  const rawFreeFlowTravelMin = progressDiff * route.estimatedDurationMin;
  const baseDwellMin = intermediateStopCount * BASE_STOP_DWELL_MIN;
  const freeFlowTotalMin = rawFreeFlowTravelMin + baseDwellMin;

  // 2. Schedule-based traffic-adjusted component
  const scheduleComponentMin = rawFreeFlowTravelMin * profile.congestionMultiplier;

  // 3. Kinematic live-speed component bounded against stalled-at-light distortion
  const nominalCorridorSpeedKmh =
    route.estimatedDurationMin > 0
      ? (route.totalDistanceKm / route.estimatedDurationMin) * 60
      : 30;
  const expectedTrafficSpeedKmh = Math.max(
    profile.minEffectiveSpeedKmh,
    nominalCorridorSpeedKmh * profile.speedFactor
  );
  const isGpsDegraded =
    vehicle.state === 'gps_degraded' || vehicle.gpsSignalStrength === 'lost';
  const observedSpeedKmh =
    !isGpsDegraded && vehicle.speedKmh > 0
      ? clamp(
          vehicle.speedKmh,
          profile.minEffectiveSpeedKmh,
          nominalCorridorSpeedKmh * 1.15
        )
      : expectedTrafficSpeedKmh;
  // Blend observed speed with corridor traffic speed so a sudden TrafficLevel change
  // immediately propagates even before the next telemetry tick updates speedKmh
  const effectiveSpeedKmh =
    !isGpsDegraded && vehicle.speedKmh > 0
      ? Math.min(observedSpeedKmh, expectedTrafficSpeedKmh * 1.05)
      : expectedTrafficSpeedKmh;
  const kinematicComponentMin = (exactDistanceKm / effectiveSpeedKmh) * 60;

  // 4. Traffic-weighted travel estimate + congestion-scaled intermediate stop dwell
  const weightedTravelMin =
    profile.scheduleWeight * scheduleComponentMin +
    profile.liveSpeedWeight * kinematicComponentMin;
  const dwellMinutes = intermediateStopCount * BASE_STOP_DWELL_MIN * profile.dwellMultiplier;

  // 5. Incident delay & conservative GPS staleness buffer
  const delayPenaltyMin =
    vehicle.state === 'delayed' ? vehicle.delayMinutes : vehicle.delayMinutes * 0.5;
  const gpsBufferMin = isGpsDegraded ? 1 : 0;

  const totalWeightedMin =
    weightedTravelMin + dwellMinutes + delayPenaltyMin + gpsBufferMin;

  const baseMinutes = Math.max(1, Math.round(freeFlowTotalMin));
  const etaMinutes = Math.max(1, Math.round(totalWeightedMin));
  const trafficDeltaMinutes = Math.max(
    0,
    Math.round(weightedTravelMin + dwellMinutes - freeFlowTotalMin)
  );

  // Realistic confidence & arrival window for parent communication
  let confidence: WeightedEtaConfidence = 'high';
  if (
    route.trafficLevel === 'heavy' ||
    isGpsDegraded ||
    vehicle.state === 'delayed' ||
    vehicle.state === 'deviated'
  ) {
    confidence = 'low';
  } else if (route.trafficLevel === 'moderate') {
    confidence = 'medium';
  }

  const extraUncertainty = isGpsDegraded ? 2 : vehicle.state === 'delayed' ? 2 : 0;
  const upperWindow = etaMinutes + profile.windowPaddingMin + extraUncertainty;
  const lowerWindow = Math.max(
    1,
    etaMinutes - (route.trafficLevel === 'clear' && !isGpsDegraded ? 0 : 1)
  );

  return {
    etaMinutes,
    baseMinutes,
    trafficDeltaMinutes,
    distanceKm,
    hasPassedStop: false,
    isAtStop: false,
    weightedBreakdown: {
      trafficLevel: route.trafficLevel,
      scheduleWeight: profile.scheduleWeight,
      liveSpeedWeight: profile.liveSpeedWeight,
      scheduleComponentMin: Number(scheduleComponentMin.toFixed(1)),
      kinematicComponentMin: Number(kinematicComponentMin.toFixed(1)),
      dwellMinutes: Number(dwellMinutes.toFixed(1)),
      intermediateStopCount,
      delayPenaltyMin: Number(delayPenaltyMin.toFixed(1)),
      gpsBufferMin,
      etaWindowMin: [lowerWindow, upperWindow],
      confidence,
    },
  };
}

/**
 * Computes traffic-aware weighted ETA (in whole minutes), traffic surcharge minutes,
 * remaining km, and weighted breakdown from current vehicle telemetry to a specific stop.
 */
export function calculateStopEta(
  route: RouteDefinition,
  vehicle: VehicleTelemetry,
  stopId: string,
  shift: ShiftMode
): StopEtaEstimate {
  return calculateWeightedStopEta(route, vehicle, stopId, shift);
}

export function createVehicleTelemetryForRoute(
  route: RouteDefinition,
  shift: ShiftMode,
  initialProgress = 0.22
): VehicleTelemetry {
  const { position, headingDeg } = interpolateAlongWaypoints(
    route.waypoints,
    initialProgress,
    shift
  );
  const orderedStops = getOrderedStopsForShift(route, shift);
  const nextStopIdx = orderedStops.findIndex((s) => s.shiftProgress > initialProgress + 0.02);
  const nextStop = nextStopIdx >= 0 ? orderedStops[nextStopIdx] : null;
  const profile = TRAFFIC_ETA_WEIGHTS[route.trafficLevel] ?? TRAFFIC_ETA_WEIGHTS.clear;
  const speedKmh = Math.round(34 * profile.speedFactor);

  const weightedNextEta = nextStop
    ? calculateWeightedStopEta(
        route,
        {
          progress: initialProgress,
          speedKmh,
          state: 'in_progress',
          delayMinutes: 0,
          gpsSignalStrength: 'strong',
        },
        nextStop.id,
        shift
      )
    : null;

  const etaToNextStopMin = weightedNextEta ? weightedNextEta.etaMinutes : 0;
  const trafficDelayMin = weightedNextEta ? weightedNextEta.trafficDeltaMinutes : 0;

  return {
    routeId: route.id,
    progress: initialProgress,
    position,
    gpsCoords: toSyntheticGpsCoords(position),
    headingDeg,
    speedKmh,
    state: etaToNextStopMin <= 5 && nextStop ? 'approaching_stop' : 'in_progress',
    delayMinutes: 0,
    trafficDelayMin,
    gpsSignalStrength: 'strong',
    lastHeartbeatSecAgo: 3,
    deviationOffset: { x: 0, y: 0 },
    currentStopIndex: Math.max(0, nextStopIdx),
    nextStopId: nextStop ? nextStop.id : null,
    etaToNextStopMin,
    isMoving: speedKmh > 5,
  };
}

export function createInitialTelemetry(
  routes: RouteDefinition[],
  shift: ShiftMode
): Record<string, VehicleTelemetry> {
  const initialProgressByRoute: Record<string, number> = {
    'route-04': shift === 'morning' ? 0.24 : 0.3,
    'route-07': shift === 'morning' ? 0.52 : 0.44,
    'route-12': shift === 'morning' ? 0.62 : 0.55,
  };

  const result: Record<string, VehicleTelemetry> = {};

  for (const route of routes) {
    const progress = initialProgressByRoute[route.id] ?? 0.22;
    result[route.id] = createVehicleTelemetryForRoute(route, shift, progress);
  }

  return result;
}

/**
 * Advances all vehicles by `deltaProgress` (pure function), scaling real speed & weighted ETA
 * by each route's live `TrafficLevel` while respecting delays, deviations, and GPS state.
 */
export function stepFleetTelemetry(
  routes: RouteDefinition[],
  current: Record<string, VehicleTelemetry>,
  shift: ShiftMode,
  deltaProgress: number
): Record<string, VehicleTelemetry> {
  const next: Record<string, VehicleTelemetry> = {};

  for (const route of routes) {
    const prev = current[route.id] ?? createVehicleTelemetryForRoute(route, shift, 0.12);

    if (prev.state === 'completed') {
      next[route.id] = {
        ...prev,
        speedKmh: 0,
        isMoving: false,
        lastHeartbeatSecAgo: 2,
      };
      continue;
    }

    const profile = TRAFFIC_ETA_WEIGHTS[route.trafficLevel] ?? TRAFFIC_ETA_WEIGHTS.clear;
    const trafficFactor = profile.speedFactor;
    const stateMultiplier =
      prev.state === 'delayed'
        ? 0.08
        : prev.state === 'gps_degraded'
        ? 0.6
        : 1.0;

    const newProgress = clamp(
      prev.progress + deltaProgress * stateMultiplier * trafficFactor,
      0,
      1
    );
    const { position: basePos, headingDeg } = interpolateAlongWaypoints(
      route.waypoints,
      newProgress,
      shift
    );

    const position: MapPoint = {
      x: basePos.x + prev.deviationOffset.x,
      y: basePos.y + prev.deviationOffset.y,
    };

    const orderedStops = getOrderedStopsForShift(route, shift);
    const nextStopIdx = orderedStops.findIndex((s) => s.shiftProgress > newProgress + 0.015);
    const nextStop = nextStopIdx >= 0 ? orderedStops[nextStopIdx] : null;

    const prelimState: VehicleTelemetry['state'] =
      newProgress >= 0.995 ? 'completed' : prev.state;

    const prelimSpeedBase =
      prelimState === 'completed'
        ? 0
        : prelimState === 'delayed'
        ? 4
        : prelimState === 'approaching_stop'
        ? 22
        : 36;
    const prelimSpeedKmh = Math.round(prelimSpeedBase * trafficFactor);

    const weightedNextEta = nextStop
      ? calculateWeightedStopEta(
          route,
          {
            progress: newProgress,
            speedKmh: prelimSpeedKmh,
            state: prelimState,
            delayMinutes: prev.delayMinutes,
            gpsSignalStrength: prev.gpsSignalStrength,
          },
          nextStop.id,
          shift
        )
      : null;

    const etaToNextStopMin = weightedNextEta ? weightedNextEta.etaMinutes : 0;
    const trafficDelayMin = weightedNextEta ? weightedNextEta.trafficDeltaMinutes : 0;

    let nextState: VehicleTelemetry['state'] = prev.state;
    if (newProgress >= 0.995) {
      nextState = 'completed';
    } else if (
      prev.state !== 'delayed' &&
      prev.state !== 'deviated' &&
      prev.state !== 'gps_degraded'
    ) {
      nextState = etaToNextStopMin <= 5 && nextStop ? 'approaching_stop' : 'in_progress';
    }

    const baseSpeed =
      nextState === 'completed'
        ? 0
        : nextState === 'delayed'
        ? 4
        : nextState === 'approaching_stop'
        ? 22
        : 36;
    const speedKmh = Math.round(baseSpeed * trafficFactor);

    next[route.id] = {
      ...prev,
      progress: newProgress,
      position,
      gpsCoords: toSyntheticGpsCoords(position),
      headingDeg,
      speedKmh,
      state: nextState,
      trafficDelayMin,
      lastHeartbeatSecAgo:
        prev.state === 'gps_degraded' ? Math.min(180, prev.lastHeartbeatSecAgo + 12) : 2,
      currentStopIndex: nextStopIdx >= 0 ? nextStopIdx : orderedStops.length - 1,
      nextStopId: nextStop ? nextStop.id : null,
      etaToNextStopMin,
      isMoving: speedKmh > 5,
    };
  }

  return next;
}

/**
 * Evaluates whether an approaching geofence notification should fire for a parent,
 * deduplicated by event key and honoring notification channel preferences.
 */
export function evaluateParentApproachingNotification(params: {
  route: RouteDefinition;
  vehicle: VehicleTelemetry;
  student: StudentRecord;
  shift: ShiftMode;
  prefs: ParentNotificationPrefs;
  firedKeys: Set<string>;
  clockLabel: string;
}): { notification: ParentNotification | null; eventKey: string | null } {
  const { route, vehicle, student, shift, prefs, firedKeys, clockLabel } = params;
  const stop = route.stops.find((s) => s.id === student.stopId);
  if (!stop) return { notification: null, eventKey: null };

  const eta = calculateStopEta(route, vehicle, student.stopId, shift);
  const eventKey = `approaching-${shift}-${route.id}-${stop.id}`;

  if (
    !eta.hasPassedStop &&
    eta.etaMinutes > 0 &&
    eta.etaMinutes <= prefs.approachingMinutes &&
    !firedKeys.has(eventKey)
  ) {
    const trafficNote =
      route.trafficLevel === 'clear'
        ? 'Traffic is clear.'
        : route.trafficLevel === 'moderate'
        ? `Includes +${eta.trafficDeltaMinutes} min for moderate traffic.`
        : `Includes +${eta.trafficDeltaMinutes} min for heavy congestion.`;
    const actionLabel =
      shift === 'morning'
        ? `Step out to ${stop.name} in ~${eta.etaMinutes} min.`
        : `Prepare for handover at ${stop.name} in ~${eta.etaMinutes} min.`;

    return {
      eventKey,
      notification: {
        id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: `${route.vehicleLabel} approaching (${eta.etaMinutes} min)`,
        body: `${actionLabel} ${eta.distanceKm} km away · ${trafficNote}`,
        timestamp: clockLabel,
        channel: prefs.smsFallbackEnabled ? 'Push' : 'In-App',
        category: 'approaching',
        read: false,
      },
    };
  }

  return { notification: null, eventKey: null };
}

/**
 * Fires an immediate arrival notification when a vehicle completes its morning trip
 * at Oakridge Academy (and the child is on board).
 */
export function evaluateDestinationArrivalNotification(params: {
  route: RouteDefinition;
  vehicle: VehicleTelemetry;
  student: StudentRecord;
  shift: ShiftMode;
  firedKeys: Set<string>;
  clockLabel: string;
}): { notification: ParentNotification | null; eventKey: string | null } {
  const { route, vehicle, student, shift, firedKeys, clockLabel } = params;
  const eventKey = `arrived-destination-${shift}-${route.id}-${student.id}`;

  if (
    shift === 'morning' &&
    vehicle.state === 'completed' &&
    student.boardingStatus === 'boarded' &&
    !firedKeys.has(eventKey)
  ) {
    return {
      eventKey,
      notification: {
        id: `notif-arrived-${Date.now()}`,
        title: `Arrived safely at Oakridge Academy · ${student.firstName}`,
        body: `${route.vehicleLabel} completed its morning route at ${clockLabel}. ${student.firstName} has reached Oakridge Academy campus.`,
        timestamp: clockLabel,
        channel: 'Push',
        category: 'completed',
        read: false,
      },
    };
  }

  return { notification: null, eventKey: null };
}

/**
 * Validates a scanned Student QR Pass against the active vehicle's assigned roster.
 * Prevents accidental wrong-bus boarding by alerting immediately when a student belongs to another route.
 */
export function validateStudentQrScan(params: {
  qrCodeInput: string;
  activeRouteId: string;
  students: StudentRecord[];
  routes: RouteDefinition[];
}):
  | { status: 'valid'; student: StudentRecord }
  | { status: 'wrong_route'; student: StudentRecord; expectedVehicle: string }
  | { status: 'not_found'; message: string } {
  const normalized = params.qrCodeInput.trim().toUpperCase();
  if (!normalized) {
    return { status: 'not_found', message: 'Enter or scan a valid student pass code.' };
  }

  const student = params.students.find(
    (s) => s.qrCodeId.toUpperCase() === normalized
  );
  if (!student) {
    return {
      status: 'not_found',
      message: `No registered student pass matches "${normalized}".`,
    };
  }

  if (student.routeId !== params.activeRouteId) {
    const expectedRoute = params.routes.find((r) => r.id === student.routeId);
    return {
      status: 'wrong_route',
      student,
      expectedVehicle: expectedRoute
        ? `${expectedRoute.vehicleLabel} (${expectedRoute.name})`
        : 'another assigned vehicle',
    };
  }

  return { status: 'valid', student };
}

/**
 * Generates a brand-new synthetic route with realistic corridor geometry & stops
 * converging on Oakridge Academy so school admins can create routes live.
 */
export function createRouteFromInput(params: {
  name: string;
  code: string;
  vehicleLabel: string;
  plateNumber: string;
  driverName: string;
  attendantName: string;
  corridorSector: 'northeast' | 'northwest' | 'southeast';
  firstStopName: string;
  secondStopName: string;
  trafficLevel: TrafficLevel;
}): RouteDefinition {
  const id = `route-${Date.now().toString(36)}`;
  const trackerNum = Math.floor(9200 + Math.random() * 700);

  const sectorConfigs: Record<
    'northeast' | 'northwest' | 'southeast',
    { color: string; waypoints: MapPoint[]; stops: [MapPoint, MapPoint]; neighborhood: string }
  > = {
    northeast: {
      color: '#0D9488',
      neighborhood: 'Eastwood',
      waypoints: [
        { x: 540, y: 72 },
        { x: 650, y: 112 },
        { x: 745, y: 185 },
        { x: 790, y: 245 },
        SCHOOL_CAMPUS_POINT,
      ],
      stops: [
        { x: 605, y: 95 },
        { x: 745, y: 185 },
      ],
    },
    northwest: {
      color: '#0284C7',
      neighborhood: 'Pinecrest',
      waypoints: [
        { x: 120, y: 215 },
        { x: 280, y: 235 },
        { x: 470, y: 255 },
        { x: 670, y: 278 },
        SCHOOL_CAMPUS_POINT,
      ],
      stops: [
        { x: 250, y: 232 },
        { x: 550, y: 265 },
      ],
    },
    southeast: {
      color: '#7C3AED',
      neighborhood: 'Brookside',
      waypoints: [
        { x: 520, y: 555 },
        { x: 645, y: 505 },
        { x: 755, y: 430 },
        { x: 805, y: 360 },
        SCHOOL_CAMPUS_POINT,
      ],
      stops: [
        { x: 615, y: 518 },
        { x: 765, y: 418 },
      ],
    },
  };

  const cfg = sectorConfigs[params.corridorSector];
  return {
    id,
    code: params.code.trim().toUpperCase(),
    name: params.name.trim(),
    vehicleLabel: params.vehicleLabel.trim(),
    plateNumber: params.plateNumber.trim().toUpperCase(),
    driverName: params.driverName.trim(),
    driverStatus: 'en_route',
    attendantName: params.attendantName.trim(),
    hardwareTrackerId: `HW-GPS-${trackerNum}`,
    colorHex: cfg.color,
    trafficLevel: params.trafficLevel,
    totalDistanceKm: 10.8,
    estimatedDurationMin: 26,
    waypoints: cfg.waypoints,
    stops: [
      {
        id: `stop-${id}-1`,
        name: params.firstStopName.trim(),
        neighborhood: cfg.neighborhood,
        position: cfg.stops[0],
        progressAtStop: 0.25,
        scheduledMorningTime: '06:54',
        scheduledAfternoonTime: '16:24',
        geofenceRadiusPx: 34,
      },
      {
        id: `stop-${id}-2`,
        name: params.secondStopName.trim(),
        neighborhood: cfg.neighborhood,
        position: cfg.stops[1],
        progressAtStop: 0.65,
        scheduledMorningTime: '07:08',
        scheduledAfternoonTime: '16:10',
        geofenceRadiusPx: 34,
      },
      {
        id: `stop-${id}-campus`,
        name: 'Oakridge Academy — Main Bay',
        neighborhood: 'School Campus',
        position: SCHOOL_CAMPUS_POINT,
        progressAtStop: 1.0,
        scheduledMorningTime: '07:24',
        scheduledAfternoonTime: '15:55',
        geofenceRadiusPx: 44,
        isSchoolCampus: true,
      },
    ],
  };
}

/**
 * Builds the 4-step Safe Handover Chain for a specific student and shift.
 */
export function buildSafeHandoverChain(params: {
  student: StudentRecord;
  route: RouteDefinition;
  vehicle: VehicleTelemetry;
  shift: ShiftMode;
}): HandoverStep[] {
  const { student, route, vehicle, shift } = params;
  const stop = route.stops.find((s) => s.id === student.stopId);
  const stopName = stop?.name ?? 'Assigned Stop';
  const eta = calculateStopEta(route, vehicle, student.stopId, shift);

  if (shift === 'morning') {
    const isBoarded = student.boardingStatus === 'boarded';
    const isNotBoarded = student.boardingStatus === 'not_boarded';
    const isCompleted = vehicle.state === 'completed' && isBoarded;
    const proofMethodLabel =
      student.handoverProof?.method === 'qr_scan'
        ? 'QR Pass'
        : student.handoverProof?.method === 'guardian_pin'
        ? 'Guardian PIN'
        : 'Attendant Check';

    return [
      {
        id: 'step-parent',
        label: 'Parent / Guardian Prep',
        actor: student.guardianName,
        status: isBoarded || eta.isAtStop ? 'completed' : 'active',
        timestamp: stop?.scheduledMorningTime ? `Window ${stop.scheduledMorningTime}` : undefined,
        detail: isBoarded
          ? 'Child escorted to pickup point'
          : `Step out for ${stopName} in ~${eta.etaMinutes} min`,
      },
      {
        id: 'step-pickup',
        label: 'Pickup Point Arrival',
        actor: `${route.vehicleLabel} · ${stopName}`,
        status: isBoarded
          ? 'completed'
          : isNotBoarded
          ? 'attention'
          : eta.isAtStop
          ? 'active'
          : 'upcoming',
        timestamp: isBoarded ? student.boardedAt : `ETA ${eta.etaMinutes} min`,
        detail: isNotBoarded
          ? 'Student flagged not present at pickup'
          : isBoarded
          ? `Confirmed via ${proofMethodLabel}${
              student.handoverProof?.hasPhotoProof ? ' + Photo Proof' : ''
            } by ${student.handoverVerifiedBy ?? route.attendantName}`
          : `${eta.distanceKm} km away · geofence armed`,
      },
      {
        id: 'step-transport',
        label: 'School Transport In Transit',
        actor: `${route.driverName} & ${route.attendantName}`,
        status: isCompleted ? 'completed' : isBoarded ? 'active' : 'upcoming',
        timestamp: isBoarded ? 'In progress' : undefined,
        detail:
          vehicle.state === 'delayed'
            ? `Delayed by +${vehicle.delayMinutes} min`
            : isBoarded
            ? `On route to Oakridge Academy (${route.trafficLevel} traffic)`
            : 'Awaiting confirmed boarding',
      },
      {
        id: 'step-school',
        label: 'School Campus Handover',
        actor: 'Oakridge Academy — North Bay',
        status: isCompleted ? 'completed' : 'upcoming',
        timestamp: isCompleted ? 'Arrived' : 'Est. 07:24',
        detail: isCompleted
          ? 'Morning journey completed safely'
          : 'School gate check-in upon arrival',
      },
    ];
  }

  // Afternoon shift: School -> School Transport -> Drop-Off Point -> Authorized Guardian
  const isBoarded =
    student.boardingStatus === 'boarded' || student.boardingStatus === 'dropped_off';
  const isDroppedOff = student.boardingStatus === 'dropped_off';

  return [
    {
      id: 'step-aft-school',
      label: 'School Dismissal Handover',
      actor: 'Oakridge Academy — North Bay',
      status: isBoarded ? 'completed' : 'active',
      timestamp: isBoarded ? student.boardedAt ?? '15:55' : '15:55',
      detail: isBoarded
        ? `Boarded ${route.vehicleLabel} at school bay`
        : 'Awaiting afternoon departure confirmation',
    },
    {
      id: 'step-aft-transport',
      label: 'Afternoon Journey Home',
      actor: `${route.vehicleLabel} · ${route.attendantName}`,
      status: isDroppedOff ? 'completed' : isBoarded ? 'active' : 'upcoming',
      timestamp: isDroppedOff ? 'Completed' : `ETA ${eta.etaMinutes} min`,
      detail:
        vehicle.state === 'delayed'
          ? `Traffic delay (+${vehicle.delayMinutes} min)`
          : `Heading to ${stopName} (${eta.distanceKm} km · ${route.trafficLevel} traffic)`,
    },
    {
      id: 'step-aft-dropoff',
      label: 'Drop-Off Point Arrival',
      actor: stopName,
      status: isDroppedOff ? 'completed' : eta.isAtStop ? 'active' : 'upcoming',
      timestamp: isDroppedOff ? student.droppedOffAt : stop?.scheduledAfternoonTime,
      detail: isDroppedOff
        ? 'Vehicle arrived and confirmed stop'
        : 'Approaching geofence active',
    },
    {
      id: 'step-aft-guardian',
      label: 'Authorized Guardian Handover',
      actor: `${student.guardianName} or ${student.authorizedBackupGuardian}`,
      status: isDroppedOff ? 'completed' : 'upcoming',
      timestamp: isDroppedOff ? student.droppedOffAt : undefined,
      detail: isDroppedOff
        ? `Handed over safely${
            student.handoverProof?.hasPhotoProof ? ' with photo proof' : ''
          } · verified by ${student.handoverVerifiedBy ?? route.attendantName}`
        : 'Requires authorized guardian presence at drop-off',
    },
  ];
}

/**
 * RBAC Privacy Boundary helper ("Visibility Without Exposure").
 * Projects fleet state strictly for a single parent so NO other student PII,
 * other home stops, or unrelated fleet routes are exposed to the Parent View.
 */
export function buildParentScopedSnapshot(params: {
  studentId: string;
  students: StudentRecord[];
  routes: RouteDefinition[];
  telemetry: Record<string, VehicleTelemetry>;
  shift: ShiftMode;
}) {
  const student = params.students.find((s) => s.id === params.studentId);
  if (!student) return null;

  const route = params.routes.find((r) => r.id === student.routeId);
  if (!route) return null;

  const vehicle = params.telemetry[route.id];
  if (!vehicle) return null;

  const visibleStops = route.stops.filter(
    (s) => s.id === student.stopId || s.isSchoolCampus
  );

  const eta = calculateStopEta(route, vehicle, student.stopId, params.shift);
  const campusStop = route.stops.find((s) => s.isSchoolCampus);
  const campusEta = campusStop
    ? calculateStopEta(route, vehicle, campusStop.id, params.shift)
    : null;
  const handoverSteps = buildSafeHandoverChain({
    student,
    route,
    vehicle,
    shift: params.shift,
  });

  return {
    student: {
      id: student.id,
      qrCodeId: student.qrCodeId,
      firstName: student.firstName,
      lastName: student.lastName,
      grade: student.grade,
      boardingStatus: student.boardingStatus,
      boardedAt: student.boardedAt,
      droppedOffAt: student.droppedOffAt,
      handoverVerifiedBy: student.handoverVerifiedBy,
      handoverProof: student.handoverProof,
      guardianName: student.guardianName,
      authorizedBackupGuardian: student.authorizedBackupGuardian,
      stopId: student.stopId,
      routeId: student.routeId,
    },
    route: {
      ...route,
      stops: visibleStops,
    },
    vehicle,
    eta,
    campusEta,
    handoverSteps,
    hiddenStopCount: route.stops.length - visibleStops.length,
    hiddenBusCount: params.routes.length - 1,
  };
}

/**
 * Triggers a Safety Layer exception on a target vehicle and returns updated telemetry + new alert.
 */
export function triggerSafetyException(params: {
  type: 'extended_delay' | 'route_deviation' | 'gps_loss' | 'student_not_boarded';
  route: RouteDefinition;
  vehicle: VehicleTelemetry;
  affectedStudentCount: number;
  clockLabel: string;
}): { updatedVehicle: VehicleTelemetry; alert: SafetyAlert } {
  const { type, route, vehicle, affectedStudentCount, clockLabel } = params;

  if (type === 'extended_delay') {
    return {
      updatedVehicle: {
        ...vehicle,
        state: 'delayed',
        delayMinutes: 12,
        speedKmh: 4,
        isMoving: false,
      },
      alert: {
        id: `alert-${Date.now()}-delay`,
        type,
        severity: 'warning',
        routeId: route.id,
        title: `Extended Delay · ${route.vehicleLabel} (${route.name})`,
        detail: `Vehicle stationary for 9+ min near corridor midpoint. Projected +12 min impact across ${affectedStudentCount} expected students.`,
        timestamp: clockLabel,
        resolved: false,
        parentBroadcastSent: false,
        affectedStudentCount,
      },
    };
  }

  if (type === 'route_deviation') {
    const deviatedPos = {
      x: vehicle.position.x + 26,
      y: vehicle.position.y - 38,
    };
    return {
      updatedVehicle: {
        ...vehicle,
        state: 'deviated',
        deviationOffset: { x: 26, y: -38 },
        position: deviatedPos,
        gpsCoords: toSyntheticGpsCoords(deviatedPos),
      },
      alert: {
        id: `alert-${Date.now()}-dev`,
        type,
        severity: 'critical',
        routeId: route.id,
        title: `Unexpected Route Deviation · ${route.vehicleLabel}`,
        detail: `${route.vehicleLabel} left the authorized ${route.name} geofence corridor by 240m. Coordinator verification required.`,
        timestamp: clockLabel,
        resolved: false,
        parentBroadcastSent: false,
        affectedStudentCount,
      },
    };
  }

  if (type === 'gps_loss') {
    return {
      updatedVehicle: {
        ...vehicle,
        state: 'gps_degraded',
        gpsSignalStrength: 'lost',
        lastHeartbeatSecAgo: 74,
      },
      alert: {
        id: `alert-${Date.now()}-gps`,
        type,
        severity: 'warning',
        routeId: route.id,
        title: `GPS Signal Degraded · ${route.vehicleLabel}`,
        detail: `Hardware tracker ${route.hardwareTrackerId} missed 3 heartbeats (74s stale). Displaying last-known position and conservative ETA.`,
        timestamp: clockLabel,
        resolved: false,
        parentBroadcastSent: false,
        affectedStudentCount,
      },
    };
  }

  return {
    updatedVehicle: vehicle,
    alert: {
      id: `alert-${Date.now()}-missed`,
      type: 'student_not_boarded',
      severity: 'critical',
      routeId: route.id,
      title: `Expected Student Did Not Board · ${route.vehicleLabel}`,
      detail: `An expected student on ${route.name} was not confirmed as boarded before stop departure. Verify absence with guardian.`,
      timestamp: clockLabel,
      resolved: false,
      parentBroadcastSent: false,
      affectedStudentCount: 1,
    },
  };
}
