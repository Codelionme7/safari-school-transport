export type WorkspaceTab = 'parent' | 'school' | 'driver' | 'blueprint';

export type ShiftMode = 'morning' | 'afternoon';

export type TrafficLevel = 'clear' | 'moderate' | 'heavy';

export type DriverStatus = 'en_route' | 'at_stop' | 'standby' | 'attention';

export type VerificationMethod = 'qr_scan' | 'checklist' | 'guardian_pin';

export type JourneyState =
  | 'not_started'
  | 'in_progress'
  | 'approaching_stop'
  | 'delayed'
  | 'deviated'
  | 'gps_degraded'
  | 'completed';

export type BoardingStatus =
  | 'expected'
  | 'boarded'
  | 'dropped_off'
  | 'not_boarded';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type AlertType =
  | 'extended_delay'
  | 'route_deviation'
  | 'student_not_boarded'
  | 'gps_loss'
  | 'school_advisory';

export interface MapPoint {
  x: number; // 0..960 synthetic coordinate space
  y: number; // 0..600 synthetic coordinate space
}

export interface GpsCoordinate {
  lat: number;
  lng: number;
}

export interface RouteStop {
  id: string;
  name: string;
  neighborhood: string;
  position: MapPoint;
  progressAtStop: number; // 0..1 along route polyline
  scheduledMorningTime: string;
  scheduledAfternoonTime: string;
  geofenceRadiusPx: number;
  isSchoolCampus?: boolean;
}

export interface RouteDefinition {
  id: string;
  code: string;
  name: string;
  vehicleLabel: string;
  plateNumber: string;
  driverName: string;
  driverStatus: DriverStatus;
  attendantName: string;
  hardwareTrackerId: string;
  colorHex: string;
  trafficLevel: TrafficLevel;
  totalDistanceKm: number;
  estimatedDurationMin: number;
  waypoints: MapPoint[];
  stops: RouteStop[];
}

export interface HandoverProof {
  method: VerificationMethod;
  timestamp: string;
  verifiedBy: string;
  guardianName?: string;
  hasPhotoProof: boolean;
  photoCaption?: string;
  gpsLabel: string;
}

export interface StudentRecord {
  id: string;
  qrCodeId: string;
  firstName: string;
  lastName: string;
  grade: string;
  routeId: string;
  stopId: string;
  guardianName: string;
  authorizedBackupGuardian: string;
  boardingStatus: BoardingStatus;
  boardedAt?: string;
  droppedOffAt?: string;
  handoverVerifiedBy?: string;
  handoverProof?: HandoverProof;
}

export interface ConfirmationAuditEntry {
  id: string;
  studentId: string;
  studentName: string;
  routeId: string;
  vehicleLabel: string;
  eventType: 'boarded' | 'dropped_off' | 'not_boarded' | 'arrived_school';
  method: VerificationMethod;
  timestamp: string;
  verifiedBy: string;
  hasPhotoProof: boolean;
  gpsLabel: string;
  note: string;
}

export interface VehicleTelemetry {
  routeId: string;
  progress: number; // 0..1
  position: MapPoint;
  gpsCoords: GpsCoordinate;
  headingDeg: number;
  speedKmh: number;
  state: JourneyState;
  delayMinutes: number;
  trafficDelayMin: number;
  gpsSignalStrength: 'strong' | 'weak' | 'lost';
  lastHeartbeatSecAgo: number;
  deviationOffset: MapPoint; // (0,0) when on route
  currentStopIndex: number;
  nextStopId: string | null;
  etaToNextStopMin: number;
  isMoving: boolean;
}

export type WeightedEtaConfidence = 'high' | 'medium' | 'low';

export interface TrafficEtaWeightProfile {
  congestionMultiplier: number;
  speedFactor: number;
  scheduleWeight: number;
  liveSpeedWeight: number;
  dwellMultiplier: number;
  minEffectiveSpeedKmh: number;
  windowPaddingMin: number;
}

export interface WeightedEtaBreakdown {
  trafficLevel: TrafficLevel;
  scheduleWeight: number;
  liveSpeedWeight: number;
  scheduleComponentMin: number;
  kinematicComponentMin: number;
  dwellMinutes: number;
  intermediateStopCount: number;
  delayPenaltyMin: number;
  gpsBufferMin: number;
  etaWindowMin: [number, number];
  confidence: WeightedEtaConfidence;
}

export interface StopEtaEstimate {
  etaMinutes: number;
  baseMinutes: number;
  trafficDeltaMinutes: number;
  distanceKm: number;
  hasPassedStop: boolean;
  isAtStop: boolean;
  weightedBreakdown: WeightedEtaBreakdown;
}

export interface SafetyAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  routeId: string;
  title: string;
  detail: string;
  timestamp: string;
  resolved: boolean;
  parentBroadcastSent: boolean;
  affectedStudentCount: number;
}

export interface ParentNotification {
  id: string;
  title: string;
  body: string;
  timestamp: string;
  channel: 'Push' | 'SMS Fallback' | 'In-App';
  category: 'approaching' | 'handover' | 'advisory' | 'completed';
  read: boolean;
}

export interface ParentNotificationPrefs {
  approachingMinutes: 3 | 5 | 8 | 10;
  smsFallbackEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursRange: string;
  notifyOnBoarding: boolean;
  notifyOnDelay: boolean;
}

export interface HandoverStep {
  id: string;
  label: string;
  actor: string;
  status: 'completed' | 'active' | 'upcoming' | 'attention';
  timestamp?: string;
  detail: string;
}

export interface DecisionOption {
  id: string;
  label: string;
  summary: string;
  weeksDelta: number;
  buildCostDeltaK: number;
  monthlyOpsPerBusUsd: number;
  safetyNote: string;
  recommended?: boolean;
}

export interface OpenDecision {
  id: string;
  number: string;
  title: string;
  question: string;
  whyItMatters: string;
  options: DecisionOption[];
}

export interface RoadmapStage {
  id: string;
  stageNumber: string;
  title: string;
  phaseLabel: string;
  durationWeeks: string;
  teamProfile: string;
  budgetBand: string;
  objective: string;
  deliverables: string[];
  productionGates: string[];
  risksAndMitigations: string[];
}
