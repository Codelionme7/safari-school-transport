import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_NOTIFICATION_PREFS,
  INITIAL_STUDENTS,
  SYNTHETIC_ROUTES,
} from '../data/syntheticData';
import {
  calculateProductionEstimate,
  DEFAULT_DECISION_SELECTIONS,
} from '../data/blueprintData';
import {
  buildParentScopedSnapshot,
  buildSafeHandoverChain,
  calculateStopEta,
  calculateWeightedStopEta,
  createInitialTelemetry,
  createRouteFromInput,
  evaluateDestinationArrivalNotification,
  evaluateParentApproachingNotification,
  interpolateAlongWaypoints,
  stepFleetTelemetry,
  TRAFFIC_ETA_WEIGHTS,
  triggerSafetyException,
  validateStudentQrScan,
} from './simulation';

test('interpolateAlongWaypoints returns start at 0 and end at 1 for morning and reverses for afternoon', () => {
  const route = SYNTHETIC_ROUTES[0];
  const morningStart = interpolateAlongWaypoints(route.waypoints, 0, 'morning');
  const morningEnd = interpolateAlongWaypoints(route.waypoints, 1, 'morning');
  const afternoonStart = interpolateAlongWaypoints(route.waypoints, 0, 'afternoon');

  assert.deepEqual(morningStart.position, route.waypoints[0]);
  assert.deepEqual(morningEnd.position, route.waypoints[route.waypoints.length - 1]);
  assert.deepEqual(afternoonStart.position, route.waypoints[route.waypoints.length - 1]);
});

test('TRAFFIC_ETA_WEIGHTS defines normalized weight profiles that shift authority to live speed under congestion', () => {
  for (const level of ['clear', 'moderate', 'heavy'] as const) {
    const profile = TRAFFIC_ETA_WEIGHTS[level];
    assert.equal(
      Number((profile.scheduleWeight + profile.liveSpeedWeight).toFixed(4)),
      1.0
    );
  }
  assert.ok(TRAFFIC_ETA_WEIGHTS.moderate.liveSpeedWeight > TRAFFIC_ETA_WEIGHTS.clear.liveSpeedWeight);
  assert.ok(TRAFFIC_ETA_WEIGHTS.heavy.liveSpeedWeight > TRAFFIC_ETA_WEIGHTS.moderate.liveSpeedWeight);
});

test('calculateStopEta increases weighted ETA, traffic delta, and arrival window under moderate and heavy traffic', () => {
  const clearRoute = { ...SYNTHETIC_ROUTES[0], trafficLevel: 'clear' as const };
  const moderateRoute = { ...SYNTHETIC_ROUTES[0], trafficLevel: 'moderate' as const };
  const heavyRoute = { ...SYNTHETIC_ROUTES[0], trafficLevel: 'heavy' as const };

  const clearVehicle = createInitialTelemetry([clearRoute], 'morning')[clearRoute.id];
  const moderateVehicle = createInitialTelemetry([moderateRoute], 'morning')[moderateRoute.id];
  const heavyVehicle = createInitialTelemetry([heavyRoute], 'morning')[heavyRoute.id];

  const clearEta = calculateStopEta(clearRoute, clearVehicle, 'stop-campus-nr', 'morning');
  const moderateEta = calculateStopEta(moderateRoute, moderateVehicle, 'stop-campus-nr', 'morning');
  const heavyEta = calculateStopEta(heavyRoute, heavyVehicle, 'stop-campus-nr', 'morning');

  assert.ok(moderateEta.etaMinutes > clearEta.etaMinutes);
  assert.ok(heavyEta.etaMinutes > moderateEta.etaMinutes);
  assert.ok(heavyEta.trafficDeltaMinutes > moderateEta.trafficDeltaMinutes);
  assert.equal(clearEta.weightedBreakdown.confidence, 'high');
  assert.equal(moderateEta.weightedBreakdown.confidence, 'medium');
  assert.equal(heavyEta.weightedBreakdown.confidence, 'low');
  assert.ok(heavyEta.weightedBreakdown.dwellMinutes > clearEta.weightedBreakdown.dwellMinutes);
  assert.ok(heavyEta.weightedBreakdown.etaWindowMin[1] > heavyEta.etaMinutes);
});

test('calculateWeightedStopEta responds more strongly to slower live speed under heavy traffic than clear traffic', () => {
  const clearRoute = { ...SYNTHETIC_ROUTES[0], trafficLevel: 'clear' as const };
  const heavyRoute = { ...SYNTHETIC_ROUTES[0], trafficLevel: 'heavy' as const };

  const fastClear = calculateWeightedStopEta(
    clearRoute,
    { progress: 0.2, speedKmh: 34, state: 'in_progress', delayMinutes: 0, gpsSignalStrength: 'strong' },
    'stop-campus-nr',
    'morning'
  );
  const slowClear = calculateWeightedStopEta(
    clearRoute,
    { progress: 0.2, speedKmh: 20, state: 'in_progress', delayMinutes: 0, gpsSignalStrength: 'strong' },
    'stop-campus-nr',
    'morning'
  );

  const expectedHeavy = calculateWeightedStopEta(
    heavyRoute,
    { progress: 0.2, speedKmh: 16, state: 'in_progress', delayMinutes: 0, gpsSignalStrength: 'strong' },
    'stop-campus-nr',
    'morning'
  );
  const crawlHeavy = calculateWeightedStopEta(
    heavyRoute,
    { progress: 0.2, speedKmh: 10, state: 'in_progress', delayMinutes: 0, gpsSignalStrength: 'strong' },
    'stop-campus-nr',
    'morning'
  );

  const clearSensitivity = slowClear.etaMinutes - fastClear.etaMinutes;
  const heavySensitivity = crawlHeavy.etaMinutes - expectedHeavy.etaMinutes;

  assert.ok(slowClear.etaMinutes > fastClear.etaMinutes);
  assert.ok(crawlHeavy.etaMinutes > expectedHeavy.etaMinutes);
  assert.ok(heavySensitivity > clearSensitivity);
});

test('calculateWeightedStopEta includes intermediate stop dwell and conservative GPS degradation buffer', () => {
  const route = { ...SYNTHETIC_ROUTES[0], trafficLevel: 'moderate' as const };
  const healthy = calculateWeightedStopEta(
    route,
    { progress: 0.15, speedKmh: 24, state: 'in_progress', delayMinutes: 0, gpsSignalStrength: 'strong' },
    'stop-campus-nr',
    'morning'
  );
  const degraded = calculateWeightedStopEta(
    route,
    { progress: 0.15, speedKmh: 24, state: 'gps_degraded', delayMinutes: 0, gpsSignalStrength: 'lost' },
    'stop-campus-nr',
    'morning'
  );

  assert.ok(healthy.weightedBreakdown.intermediateStopCount >= 2);
  assert.ok(healthy.weightedBreakdown.dwellMinutes > 0);
  assert.equal(degraded.weightedBreakdown.gpsBufferMin, 1);
  assert.equal(degraded.weightedBreakdown.confidence, 'low');
  assert.ok(degraded.etaMinutes >= healthy.etaMinutes);
});

test('stepFleetTelemetry advances vehicle progress, updates GPS coords, and keeps weighted next-stop ETA in sync', () => {
  const initial = createInitialTelemetry(SYNTHETIC_ROUTES, 'morning');
  const route04 = SYNTHETIC_ROUTES[0];
  const etaBefore = calculateStopEta(route04, initial['route-04'], 'stop-nr-2', 'morning');

  const stepped = stepFleetTelemetry(SYNTHETIC_ROUTES, initial, 'morning', 0.12);
  const etaAfter = calculateStopEta(route04, stepped['route-04'], 'stop-nr-2', 'morning');

  assert.ok(stepped['route-04'].progress > initial['route-04'].progress);
  assert.ok(etaAfter.etaMinutes < etaBefore.etaMinutes);
  assert.notDeepEqual(stepped['route-04'].gpsCoords, initial['route-04'].gpsCoords);

  // Switching traffic level on a zero-progress step immediately recalculates weighted etaToNextStopMin
  const heavyRoutes = SYNTHETIC_ROUTES.map((r) =>
    r.id === 'route-04' ? { ...r, trafficLevel: 'heavy' as const } : r
  );
  const recalculated = stepFleetTelemetry(heavyRoutes, initial, 'morning', 0);
  assert.ok(recalculated['route-04'].etaToNextStopMin > initial['route-04'].etaToNextStopMin);
});

test('validateStudentQrScan approves assigned student, flags wrong-bus student, and rejects unknown code', () => {
  const valid = validateStudentQrScan({
    qrCodeInput: 'saf-nr04-01',
    activeRouteId: 'route-04',
    students: INITIAL_STUDENTS,
    routes: SYNTHETIC_ROUTES,
  });
  assert.equal(valid.status, 'valid');
  if (valid.status === 'valid') {
    assert.equal(valid.student.firstName, 'Maya');
  }

  const wrongBus = validateStudentQrScan({
    qrCodeInput: 'SAF-WM07-05',
    activeRouteId: 'route-04',
    students: INITIAL_STUDENTS,
    routes: SYNTHETIC_ROUTES,
  });
  assert.equal(wrongBus.status, 'wrong_route');
  if (wrongBus.status === 'wrong_route') {
    assert.ok(wrongBus.expectedVehicle.includes('Bus 07'));
  }

  const unknown = validateStudentQrScan({
    qrCodeInput: 'SAF-9999-XX',
    activeRouteId: 'route-04',
    students: INITIAL_STUDENTS,
    routes: SYNTHETIC_ROUTES,
  });
  assert.equal(unknown.status, 'not_found');
});

test('evaluateParentApproachingNotification fires once within threshold and deduplicates', () => {
  const initial = createInitialTelemetry(SYNTHETIC_ROUTES, 'morning');
  const route = SYNTHETIC_ROUTES[0];
  const maya = INITIAL_STUDENTS.find((s) => s.id === 'stu-01')!;
  const fired = new Set<string>();

  const first = evaluateParentApproachingNotification({
    route,
    vehicle: initial['route-04'],
    student: maya,
    shift: 'morning',
    prefs: { ...INITIAL_NOTIFICATION_PREFS, approachingMinutes: 10 },
    firedKeys: fired,
    clockLabel: '06:58',
  });

  assert.ok(first.notification !== null, 'Expected approaching notification to fire');
  assert.ok(first.eventKey !== null);
  fired.add(first.eventKey!);

  const second = evaluateParentApproachingNotification({
    route,
    vehicle: initial['route-04'],
    student: maya,
    shift: 'morning',
    prefs: { ...INITIAL_NOTIFICATION_PREFS, approachingMinutes: 10 },
    firedKeys: fired,
    clockLabel: '06:59',
  });

  assert.equal(second.notification, null, 'Duplicate approaching alert must be suppressed');
});

test('evaluateDestinationArrivalNotification fires immediately when morning trip completes with boarded student', () => {
  const initial = createInitialTelemetry(SYNTHETIC_ROUTES, 'morning');
  const route = SYNTHETIC_ROUTES[0];
  const mayaBoarded = { ...INITIAL_STUDENTS[0], boardingStatus: 'boarded' as const };
  const completedVehicle = { ...initial['route-04'], state: 'completed' as const, progress: 1 };
  const fired = new Set<string>();

  const first = evaluateDestinationArrivalNotification({
    route,
    vehicle: completedVehicle,
    student: mayaBoarded,
    shift: 'morning',
    firedKeys: fired,
    clockLabel: '07:24',
  });
  assert.ok(first.notification !== null);
  assert.ok(first.notification!.title.includes('Oakridge Academy'));
  fired.add(first.eventKey!);

  const second = evaluateDestinationArrivalNotification({
    route,
    vehicle: completedVehicle,
    student: mayaBoarded,
    shift: 'morning',
    firedKeys: fired,
    clockLabel: '07:25',
  });
  assert.equal(second.notification, null);
});

test('createRouteFromInput generates a valid route converging on Oakridge Academy', () => {
  const route = createRouteFromInput({
    name: 'Eastwood Express',
    code: 'EW-15',
    vehicleLabel: 'Bus 15',
    plateNumber: 'KDL 515E',
    driverName: 'Josephine Wairimu',
    attendantName: 'Mercy Njeri',
    corridorSector: 'northeast',
    firstStopName: 'Eastwood Gate',
    secondStopName: 'Crestview Plaza',
    trafficLevel: 'moderate',
  });

  assert.equal(route.code, 'EW-15');
  assert.equal(route.stops.length, 3);
  assert.equal(route.stops[2].isSchoolCampus, true);
  assert.equal(route.trafficLevel, 'moderate');
});

test('buildParentScopedSnapshot enforces Visibility Without Exposure by stripping unrelated stops and buses', () => {
  const telemetry = createInitialTelemetry(SYNTHETIC_ROUTES, 'morning');
  const scoped = buildParentScopedSnapshot({
    studentId: 'stu-01',
    students: INITIAL_STUDENTS,
    routes: SYNTHETIC_ROUTES,
    telemetry,
    shift: 'morning',
  });

  assert.ok(scoped !== null);
  assert.equal(scoped!.student.firstName, 'Maya');
  assert.equal(scoped!.route.stops.length, 2);
  assert.equal(scoped!.hiddenStopCount, 2);
  assert.equal(scoped!.hiddenBusCount, 2);
});

test('buildSafeHandoverChain transitions to in-transit when student boarding is confirmed', () => {
  const telemetry = createInitialTelemetry(SYNTHETIC_ROUTES, 'morning');
  const route = SYNTHETIC_ROUTES[0];
  const maya = {
    ...INITIAL_STUDENTS[0],
    boardingStatus: 'boarded' as const,
    boardedAt: '07:04',
    handoverVerifiedBy: 'Grace Wanjiku',
  };

  const steps = buildSafeHandoverChain({
    student: maya,
    route,
    vehicle: telemetry['route-04'],
    shift: 'morning',
  });

  assert.equal(steps[0].status, 'completed');
  assert.equal(steps[1].status, 'completed');
  assert.equal(steps[2].status, 'active');
});

test('triggerSafetyException marks route deviation and delay states cleanly', () => {
  const telemetry = createInitialTelemetry(SYNTHETIC_ROUTES, 'morning');
  const route = SYNTHETIC_ROUTES[1];

  const delayed = triggerSafetyException({
    type: 'extended_delay',
    route,
    vehicle: telemetry[route.id],
    affectedStudentCount: 4,
    clockLabel: '07:05',
  });
  assert.equal(delayed.updatedVehicle.state, 'delayed');
  assert.equal(delayed.updatedVehicle.delayMinutes, 12);
  assert.equal(delayed.alert.severity, 'warning');

  const deviated = triggerSafetyException({
    type: 'route_deviation',
    route,
    vehicle: telemetry[route.id],
    affectedStudentCount: 4,
    clockLabel: '07:06',
  });
  assert.equal(deviated.updatedVehicle.state, 'deviated');
  assert.equal(deviated.alert.severity, 'critical');
  assert.notDeepEqual(deviated.updatedVehicle.deviationOffset, { x: 0, y: 0 });
});

test('calculateProductionEstimate adjusts timeline and cost dynamically based on open decisions', () => {
  const defaultEst = calculateProductionEstimate(DEFAULT_DECISION_SELECTIONS);
  const minimalPilotEst = calculateProductionEstimate({
    ...DEFAULT_DECISION_SELECTIONS,
    device: 'driver-phone',
    boarding: 'eta-only-mvp',
    'parent-client': 'pwa-first',
  });

  assert.ok(defaultEst.totalWeeksMin > minimalPilotEst.totalWeeksMin);
  assert.ok(defaultEst.buildCostMinK > minimalPilotEst.buildCostMinK);
  assert.ok(defaultEst.monthlyOpsPerBusUsd > minimalPilotEst.monthlyOpsPerBusUsd);
});
