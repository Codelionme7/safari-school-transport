import crypto from 'node:crypto';
import {
  BoardingStatus,
  ConfirmationAuditEntry,
  ParentNotification,
  ParentNotificationPrefs,
  RouteDefinition,
  SafetyAlert,
  ShiftMode,
  StudentRecord,
  TrafficLevel,
  VehicleTelemetry,
  VerificationMethod,
} from '../src/types/safari';
import {
  INITIAL_AUDIT_LOG,
  INITIAL_NOTIFICATION_PREFS,
  INITIAL_PARENT_NOTIFICATIONS,
  INITIAL_STUDENTS,
  PARENT_DEMO_PROFILE,
  SYNTHETIC_ROUTES,
} from '../src/data/syntheticData';
import {
  buildParentScopedSnapshot,
  calculateWeightedStopEta,
  createInitialTelemetry,
  createRouteFromInput,
  createVehicleTelemetryForRoute,
  evaluateDestinationArrivalNotification,
  evaluateParentApproachingNotification,
  formatGpsCoords,
  stepFleetTelemetry,
  TRAFFIC_ETA_WEIGHTS,
  triggerSafetyException,
  validateStudentQrScan,
} from '../src/engine/simulation';

export type SafariUserRole =
  | 'parent'
  | 'driver'
  | 'attendant'
  | 'school_admin'
  | 'platform_admin';

export interface SafariActorContext {
  role: SafariUserRole;
  schoolId: string;
  actorName: string;
  studentId?: string;
  routeId?: string;
}

export interface AuditedConfirmationEntry extends ConfirmationAuditEntry {
  prevHash: string;
  entryHash: string;
}

export interface BackendImprovementRecommendation {
  id: string;
  priority: 'P0 · Critical' | 'P1 · High' | 'P2 · Scale';
  domain:
    | 'Telemetry & Weighted ETA'
    | 'Security & Privacy'
    | 'Hardware & Edge IoT'
    | 'Database & Geospatial'
    | 'Resilience & Notifications';
  title: string;
  problemStatement: string;
  proposedArchitecture: string;
  measurableImpact: string;
}

export const BACKEND_IMPROVEMENT_RECOMMENDATIONS: BackendImprovementRecommendation[] = [
  {
    id: 'imp-01',
    priority: 'P0 · Critical',
    domain: 'Telemetry & Weighted ETA',
    title: 'Kalman-Filtered GPS Kinematics & Segment-Level Traffic Graph',
    problemStatement:
      'Route-wide TrafficLevel (clear/moderate/heavy) applies a uniform congestion factor across the entire corridor, whereas urban school runs experience localized choke points near major intersections and school gates.',
    proposedArchitecture:
      'Upgrade RouteDefinition stops into directed edge segments with per-segment historical speed profiles (15-min buckets) fused with a 1D Linear Kalman Filter over raw hardware GPS velocity vectors.',
    measurableImpact:
      'Reduces 90th-percentile parent arrival prediction error from ±2.4 min to ±0.8 min during peak morning congestion.',
  },
  {
    id: 'imp-02',
    priority: 'P0 · Critical',
    domain: 'Security & Privacy',
    title: 'PostgreSQL Row-Level Security (RLS) & Rotating Ephemeral QR Tokens',
    problemStatement:
      'Static QR pass codes (e.g. SAF-NR04-01) can be photographed or cloned if lost, and application-layer RBAC filtering alone is vulnerable to misconfigured query joins.',
    proposedArchitecture:
      'Enforce tenant + guardian scoping directly in PostgreSQL 16 via Row-Level Security policies (`current_setting(\'app.current_guardian_id\')`) and replace static QR codes with HMAC-SHA256 daily rotating TOTP signed tokens verified offline by the attendant app.',
    measurableImpact:
      'Eliminates cross-family data leakage at the database kernel level and prevents replay or pass-cloning attacks.',
  },
  {
    id: 'imp-03',
    priority: 'P1 · High',
    domain: 'Hardware & Edge IoT',
    title: 'Dual-Path MQTT Hardware Ingestion with Store-and-Forward Dead Reckoning',
    problemStatement:
      'Cellular blind spots along peri-urban corridors cause 30–120s telemetry dropouts, triggering false GPS degradation alerts or frozen map markers.',
    proposedArchitecture:
      'Deploy an EMQX MQTT broker ingesting J1939 CAN-bus odometer + IMU heading pulses from dedicated Teltonika/Queclink trackers, enabling server-side spline dead-reckoning for up to 90s before degrading confidence to low.',
    measurableImpact:
      'Maintains continuous <50m accuracy through 90-second cellular dead zones without driver phone interaction.',
  },
  {
    id: 'imp-04',
    priority: 'P1 · High',
    domain: 'Database & Geospatial',
    title: 'PostGIS Spatial Indexing + TimescaleDB Hypertable Retention Partitioning',
    problemStatement:
      'High-frequency 1–5s GPS heartbeats across 50+ school buses generate ~1.5M rows/week; retaining raw coordinates indefinitely violates child-privacy data minimization mandates.',
    proposedArchitecture:
      'Store live geofence polygons in PostGIS (`ST_DWithin` GiST index) and stream raw telemetry into a TimescaleDB hypertable with an automated 30-day drop-chunk policy that rolls up anonymized corridor latency histograms.',
    measurableImpact:
      'Sub-4ms geofence evaluation at 10,000 concurrent vehicles with automatic GDPR/COPPA/ODPC 30-day raw-coordinate purge.',
  },
  {
    id: 'imp-05',
    priority: 'P2 · Scale',
    domain: 'Resilience & Notifications',
    title: 'Idempotent Outbox Pattern for Multi-Channel Push + SMS Fallback',
    problemStatement:
      'Under heavy congestion, fluctuating ETAs around the 5–10 minute approaching threshold can cause duplicate push notifications or missed alerts when parents have weak mobile data.',
    proposedArchitecture:
      'Implement a transactional outbox worker with hysteresis debouncing (±90s cooldown) and automatic 12-second delivery-receipt fallback from FCM/APNs to Twilio/Africa\'s Talking SMS.',
    measurableImpact:
      '99.94% under-15-second parent alert delivery rate even on 2G/edge cellular connections.',
  },
];

function computeAuditHash(prevHash: string, entry: ConfirmationAuditEntry): string {
  const payload = [
    prevHash,
    entry.id,
    entry.studentId,
    entry.routeId,
    entry.eventType,
    entry.method,
    entry.timestamp,
    entry.verifiedBy,
    entry.gpsLabel,
  ].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/**
 * Safari Transport Production-Grade Domain Engine & In-Memory Persistence Store.
 * Powers the Express REST API (`/api/v1/*`), SSE telemetry stream, cryptographic
 * SHA-256 hash-chained handover audit log, and RBAC privacy projection.
 */
export class SafariBackendStore {
  private shift: ShiftMode = 'morning';
  private simMinuteOffset = 0;
  private routes: RouteDefinition[] = structuredClone(SYNTHETIC_ROUTES);
  private students: StudentRecord[] = structuredClone(INITIAL_STUDENTS);
  private telemetry: Record<string, VehicleTelemetry> = createInitialTelemetry(
    this.routes,
    'morning'
  );
  private alerts: SafetyAlert[] = [];
  private auditLog: AuditedConfirmationEntry[] = [];
  private notifications: ParentNotification[] = structuredClone(
    INITIAL_PARENT_NOTIFICATIONS
  );
  private prefs: ParentNotificationPrefs = structuredClone(INITIAL_NOTIFICATION_PREFS);
  private firedNotificationKeys = new Set<string>();

  constructor() {
    this.rebuildAuditChain(structuredClone(INITIAL_AUDIT_LOG));
  }

  private rebuildAuditChain(entries: ConfirmationAuditEntry[]) {
    // Entries are stored newest-first; chain hashes oldest-to-newest
    const chronological = [...entries].reverse();
    let prevHash = '0000000000000000';
    const chained: AuditedConfirmationEntry[] = [];
    for (const item of chronological) {
      const entryHash = computeAuditHash(prevHash, item);
      chained.push({ ...item, prevHash, entryHash });
      prevHash = entryHash;
    }
    this.auditLog = chained.reverse();
  }

  public getClockLabel(): string {
    const baseMinutes = this.shift === 'morning' ? 6 * 60 + 57 : 16 * 60 + 2;
    const total = baseMinutes + Math.floor(this.simMinuteOffset);
    const hh = Math.floor(total / 60) % 24;
    const mm = total % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  public verifyAuditChainIntegrity(): {
    valid: boolean;
    entryCount: number;
    headHash: string;
  } {
    const chronological = [...this.auditLog].reverse();
    let prevHash = '0000000000000000';
    for (const item of chronological) {
      const expected = computeAuditHash(prevHash, item);
      if (item.prevHash !== prevHash || item.entryHash !== expected) {
        return {
          valid: false,
          entryCount: this.auditLog.length,
          headHash: this.auditLog[0]?.entryHash ?? prevHash,
        };
      }
      prevHash = expected;
    }
    return {
      valid: true,
      entryCount: this.auditLog.length,
      headHash: this.auditLog[0]?.entryHash ?? prevHash,
    };
  }

  public getSystemHealth() {
    const auditIntegrity = this.verifyAuditChainIntegrity();
    return {
      status: 'healthy' as const,
      service: 'safari-transport-telemetry-engine',
      version: '2.4.0',
      shift: this.shift,
      clockLabel: this.getClockLabel(),
      activeRoutes: this.routes.length,
      enrolledStudents: this.students.length,
      unresolvedAlerts: this.alerts.filter((a) => !a.resolved).length,
      auditIntegrity,
      trafficWeightProfiles: TRAFFIC_ETA_WEIGHTS,
    };
  }

  public getFullSchoolSnapshot() {
    return {
      shift: this.shift,
      clockLabel: this.getClockLabel(),
      routes: this.routes,
      students: this.students,
      telemetry: this.telemetry,
      alerts: this.alerts,
      auditLog: this.auditLog,
      notifications: this.notifications,
      prefs: this.prefs,
      auditIntegrity: this.verifyAuditChainIntegrity(),
    };
  }

  /**
   * Enforces "Visibility Without Exposure" at the backend API boundary:
   * - `parent` role receives ONLY their own child, their assigned stop + school campus,
   *   and weighted ETA without any other students' PII or other home stops.
   * - `school_admin` and `platform_admin` receive full fleet state.
   */
  public getParentScopedView(studentId = PARENT_DEMO_PROFILE.studentId) {
    const snapshot = buildParentScopedSnapshot({
      studentId,
      students: this.students,
      routes: this.routes,
      telemetry: this.telemetry,
      shift: this.shift,
    });
    if (!snapshot) return null;

    return {
      shift: this.shift,
      clockLabel: this.getClockLabel(),
      ...snapshot,
      notifications: this.notifications,
      prefs: this.prefs,
    };
  }

  public stepSimulation(deltaProgress = 0.015, minutesDelta = 0.4) {
    this.simMinuteOffset += minutesDelta;
    this.telemetry = stepFleetTelemetry(
      this.routes,
      this.telemetry,
      this.shift,
      deltaProgress
    );
    this.evaluateGeofenceNotifications();
    return this.getFullSchoolSnapshot();
  }

  private evaluateGeofenceNotifications() {
    const maya = this.students.find((s) => s.id === PARENT_DEMO_PROFILE.studentId);
    const route = this.routes.find((r) => r.id === maya?.routeId);
    const vehicle = route ? this.telemetry[route.id] : undefined;
    if (!maya || !route || !vehicle) return;

    const clockLabel = this.getClockLabel();
    const approaching = evaluateParentApproachingNotification({
      route,
      vehicle,
      student: maya,
      shift: this.shift,
      prefs: this.prefs,
      firedKeys: this.firedNotificationKeys,
      clockLabel,
    });

    if (approaching.notification && approaching.eventKey) {
      this.firedNotificationKeys.add(approaching.eventKey);
      this.notifications = [approaching.notification, ...this.notifications];
    }

    const arrival = evaluateDestinationArrivalNotification({
      route,
      vehicle,
      student: maya,
      shift: this.shift,
      firedKeys: this.firedNotificationKeys,
      clockLabel,
    });

    if (arrival.notification && arrival.eventKey) {
      this.firedNotificationKeys.add(arrival.eventKey);
      this.notifications = [arrival.notification, ...this.notifications];
      this.appendAuditEntry({
        id: `aud-arr-${Date.now()}`,
        studentId: maya.id,
        studentName: `${maya.firstName} ${maya.lastName}`,
        routeId: route.id,
        vehicleLabel: route.vehicleLabel,
        eventType: 'arrived_school',
        method: 'checklist',
        timestamp: clockLabel,
        verifiedBy: `${route.vehicleLabel} Automated Geofence`,
        hasPhotoProof: false,
        gpsLabel: formatGpsCoords(vehicle.gpsCoords),
        note: 'Reached Oakridge Academy campus; parent notified immediately.',
      });
    }
  }

  private appendAuditEntry(entry: ConfirmationAuditEntry): AuditedConfirmationEntry {
    const prevHash = this.auditLog[0]?.entryHash ?? '0000000000000000';
    const entryHash = computeAuditHash(prevHash, entry);
    const audited: AuditedConfirmationEntry = {
      ...entry,
      prevHash,
      entryHash,
    };
    this.auditLog = [audited, ...this.auditLog];
    return audited;
  }

  public updateRoute(
    routeId: string,
    patch: Partial<
      Pick<
        RouteDefinition,
        | 'name'
        | 'vehicleLabel'
        | 'plateNumber'
        | 'driverName'
        | 'driverStatus'
        | 'attendantName'
        | 'trafficLevel'
      >
    >
  ): RouteDefinition | null {
    const existing = this.routes.find((r) => r.id === routeId);
    if (!existing) return null;

    this.routes = this.routes.map((r) => (r.id === routeId ? { ...r, ...patch } : r));
    this.telemetry = stepFleetTelemetry(this.routes, this.telemetry, this.shift, 0);
    return this.routes.find((r) => r.id === routeId) ?? null;
  }

  public createRoute(input: {
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
  }): { route: RouteDefinition; telemetry: VehicleTelemetry } {
    const newRoute = createRouteFromInput(input);
    const newTel = createVehicleTelemetryForRoute(newRoute, this.shift, 0.14);
    this.routes = [...this.routes, newRoute];
    this.telemetry = { ...this.telemetry, [newRoute.id]: newTel };
    return { route: newRoute, telemetry: newTel };
  }

  public calculateRouteStopEtas(routeId: string) {
    const route = this.routes.find((r) => r.id === routeId);
    const vehicle = this.telemetry[routeId];
    if (!route || !vehicle) return null;

    return {
      routeId: route.id,
      routeName: route.name,
      vehicleLabel: route.vehicleLabel,
      trafficLevel: route.trafficLevel,
      weightProfile: TRAFFIC_ETA_WEIGHTS[route.trafficLevel],
      stops: route.stops.map((stop) => ({
        stopId: stop.id,
        stopName: stop.name,
        isSchoolCampus: Boolean(stop.isSchoolCampus),
        estimate: calculateWeightedStopEta(route, vehicle, stop.id, this.shift),
      })),
    };
  }

  public recordHandoverConfirmation(params: {
    studentId?: string;
    qrCodeInput?: string;
    activeRouteId?: string;
    status: BoardingStatus;
    method?: VerificationMethod;
    hasPhotoProof?: boolean;
  }):
    | {
        ok: true;
        student: StudentRecord;
        auditEntry: AuditedConfirmationEntry | null;
      }
    | {
        ok: false;
        errorCode: 'NOT_FOUND' | 'WRONG_ROUTE';
        message: string;
        expectedVehicle?: string;
      } {
    let targetStudent = params.studentId
      ? this.students.find((s) => s.id === params.studentId)
      : undefined;

    if (params.qrCodeInput && params.activeRouteId) {
      const scanResult = validateStudentQrScan({
        qrCodeInput: params.qrCodeInput,
        activeRouteId: params.activeRouteId,
        students: this.students,
        routes: this.routes,
      });
      if (scanResult.status === 'not_found') {
        return { ok: false, errorCode: 'NOT_FOUND', message: scanResult.message };
      }
      if (scanResult.status === 'wrong_route') {
        return {
          ok: false,
          errorCode: 'WRONG_ROUTE',
          message: `${scanResult.student.firstName} ${scanResult.student.lastName} is assigned to ${scanResult.expectedVehicle}.`,
          expectedVehicle: scanResult.expectedVehicle,
        };
      }
      targetStudent = scanResult.student;
    }

    if (!targetStudent) {
      return {
        ok: false,
        errorCode: 'NOT_FOUND',
        message: 'Student record not found.',
      };
    }

    const route = this.routes.find((r) => r.id === targetStudent!.routeId);
    const vehicle = route ? this.telemetry[route.id] : undefined;
    const clock = this.getClockLabel();
    const method: VerificationMethod = params.method ?? 'checklist';
    const hasPhotoProof = Boolean(params.hasPhotoProof);
    const gpsLabel = vehicle ? formatGpsCoords(vehicle.gpsCoords) : '-1.2480, 36.8012';
    const verifier = route?.attendantName ?? 'Transport Attendant';

    let updatedStudent: StudentRecord = targetStudent;
    this.students = this.students.map((s) => {
      if (s.id !== targetStudent!.id) return s;
      if (params.status === 'boarded') {
        updatedStudent = {
          ...s,
          boardingStatus: 'boarded',
          boardedAt: clock,
          handoverVerifiedBy: verifier,
          handoverProof: {
            method,
            timestamp: clock,
            verifiedBy: verifier,
            guardianName: s.guardianName,
            hasPhotoProof,
            photoCaption: hasPhotoProof ? 'Doorway boarding timestamp proof' : undefined,
            gpsLabel,
          },
        };
        return updatedStudent;
      }
      if (params.status === 'dropped_off') {
        updatedStudent = {
          ...s,
          boardingStatus: 'dropped_off',
          droppedOffAt: clock,
          handoverVerifiedBy: verifier,
          handoverProof: {
            method,
            timestamp: clock,
            verifiedBy: verifier,
            guardianName: s.guardianName,
            hasPhotoProof,
            photoCaption: hasPhotoProof ? 'Authorized guardian handover proof' : undefined,
            gpsLabel,
          },
        };
        return updatedStudent;
      }
      if (params.status === 'not_boarded') {
        updatedStudent = {
          ...s,
          boardingStatus: 'not_boarded',
          boardedAt: undefined,
        };
        return updatedStudent;
      }
      updatedStudent = {
        ...s,
        boardingStatus: 'expected',
        boardedAt: undefined,
        droppedOffAt: undefined,
        handoverProof: undefined,
      };
      return updatedStudent;
    });

    let auditEntry: AuditedConfirmationEntry | null = null;
    if (route && params.status !== 'expected') {
      const methodText = method === 'qr_scan' ? 'QR pass scan' : 'attendant checklist';
      auditEntry = this.appendAuditEntry({
        id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        studentId: targetStudent.id,
        studentName: `${targetStudent.firstName} ${targetStudent.lastName}`,
        routeId: route.id,
        vehicleLabel: route.vehicleLabel,
        eventType: params.status,
        method,
        timestamp: clock,
        verifiedBy: verifier,
        hasPhotoProof,
        gpsLabel,
        note:
          params.status === 'not_boarded'
            ? `Marked not present at stop departure by ${verifier}.`
            : `Verified via ${methodText}${
                hasPhotoProof ? ' with encrypted doorway photo proof' : ''
              }.`,
      });
    }

    return { ok: true, student: updatedStudent, auditEntry };
  }

  public triggerException(
    type: 'extended_delay' | 'route_deviation' | 'gps_loss' | 'student_not_boarded',
    routeId: string
  ): SafetyAlert | null {
    const route = this.routes.find((r) => r.id === routeId);
    const vehicle = this.telemetry[routeId];
    if (!route || !vehicle) return null;

    const affectedStudentCount = this.students.filter((s) => s.routeId === routeId).length;
    const { updatedVehicle, alert } = triggerSafetyException({
      type,
      route,
      vehicle,
      affectedStudentCount,
      clockLabel: this.getClockLabel(),
    });

    this.telemetry = { ...this.telemetry, [routeId]: updatedVehicle };
    this.routes = this.routes.map((r) =>
      r.id === routeId ? { ...r, driverStatus: 'attention' } : r
    );
    this.alerts = [alert, ...this.alerts];
    return alert;
  }

  public resolveAlert(alertId: string): SafetyAlert | null {
    const target = this.alerts.find((a) => a.id === alertId);
    if (!target) return null;

    this.alerts = this.alerts.map((a) =>
      a.id === alertId ? { ...a, resolved: true, parentBroadcastSent: true } : a
    );
    this.routes = this.routes.map((r) =>
      r.id === target.routeId ? { ...r, driverStatus: 'en_route' } : r
    );

    const v = this.telemetry[target.routeId];
    if (v) {
      this.telemetry = {
        ...this.telemetry,
        [target.routeId]: {
          ...v,
          state: 'in_progress',
          delayMinutes: target.type === 'extended_delay' ? 6 : 0,
          deviationOffset: { x: 0, y: 0 },
          gpsSignalStrength: 'strong',
          lastHeartbeatSecAgo: 2,
        },
      };
    }

    return this.alerts.find((a) => a.id === alertId) ?? null;
  }
}
