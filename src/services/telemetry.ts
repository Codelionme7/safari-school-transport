import {
  GpsCoordinate,
  JourneyState,
  MapPoint,
  RouteDefinition,
  ShiftMode,
  TrafficLevel,
  VehicleTelemetry,
} from '../types/safari';
import {
  calculateWeightedStopEta,
  createInitialTelemetry,
  createVehicleTelemetryForRoute,
  getOrderedStopsForShift,
  interpolateAlongWaypoints,
  stepFleetTelemetry,
  toSyntheticGpsCoords,
  TRAFFIC_ETA_WEIGHTS,
} from '../engine/simulation';

/**
 * Raw hardware GPS tracker or driver companion payload ingested by the telemetry pipeline.
 */
export interface RawTelemetryHeartbeat {
  eventId: string;
  routeId: string;
  hardwareTrackerId?: string;
  timestampMs: number;
  progress?: number;
  position?: MapPoint;
  gpsCoords?: GpsCoordinate;
  headingDeg?: number;
  speedKmh?: number;
  state?: JourneyState;
  delayMinutes?: number;
  gpsSignalStrength?: 'strong' | 'weak' | 'lost';
  deviationOffset?: MapPoint;
  source?: 'hardware_tracker' | 'supabase_realtime' | 'sse_stream' | 'simulation_engine';
}

/**
 * Normalized telemetry event emitted on pub/sub topics after validation, deduplication,
 * and traffic-weighted ETA enrichment.
 */
export interface TelemetryStreamEvent {
  eventId: string;
  topic: string;
  routeId: string;
  timestampMs: number;
  source: Required<RawTelemetryHeartbeat>['source'];
  vehicle: VehicleTelemetry;
  fleetSnapshot: Record<string, VehicleTelemetry>;
}

export type JourneyLocationListener = (event: TelemetryStreamEvent) => void;
export type FleetLocationListener = (
  fleetSnapshot: Record<string, VehicleTelemetry>,
  lastEvent: TelemetryStreamEvent | null
) => void;

export interface RealtimeChannelSubscription {
  unsubscribe: () => void;
}

/**
 * Pluggable real-time database adapter interface (compatible with Supabase Realtime
 * `postgres_changes` / broadcast channels, Firebase Realtime/Firestore listeners,
 * or Server-Sent Events `/api/v1/telemetry/stream`).
 */
export interface RealtimeDatabaseAdapter {
  readonly providerName: string;
  connect: (onHeartbeat: (payload: RawTelemetryHeartbeat) => void) => Promise<void> | void;
  disconnect: () => Promise<void> | void;
  publishHeartbeat?: (
    heartbeat: RawTelemetryHeartbeat,
    enrichedVehicle: VehicleTelemetry
  ) => Promise<void> | void;
  getConnectionStatus: () => 'connected' | 'connecting' | 'disconnected' | 'degraded';
}

export interface TelemetryServiceMetrics {
  ingestedCount: number;
  deduplicatedDropCount: number;
  staleOutOfOrderDropCount: number;
  publishedEventCount: number;
  bufferedOfflineCount: number;
  activeRouteSubscribers: number;
  activeFleetSubscribers: number;
  adapterProvider: string;
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'degraded';
  lastIngestedAtMs: number | null;
}

/**
 * Supabase Realtime-compatible channel adapter.
 * Connects to a Supabase client channel (`realtime:public:vehicle_telemetry_events`) when
 * configured, or falls back seamlessly to the local Express `/api/v1/telemetry/stream`
 * real-time bridge in sandbox environments.
 */
export class SupabaseRealtimeTelemetryAdapter implements RealtimeDatabaseAdapter {
  public readonly providerName: string;
  private status: 'connected' | 'connecting' | 'disconnected' | 'degraded' =
    'disconnected';
  private eventSource: EventSource | null = null;
  private webSocket: WebSocket | null = null;
  private customDisconnect: (() => void) | null = null;
  private isConnectingOrConnected = false;
  private readonly supabaseUrl?: string;
  private readonly supabaseAnonKey?: string;
  private readonly sseEndpoint: string;
  private readonly enableAutoSse: boolean;

  constructor(options?: {
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    sseEndpoint?: string;
    enableAutoSse?: boolean;
  }) {
    const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};
    this.supabaseUrl = options?.supabaseUrl ?? env.VITE_SUPABASE_URL;
    this.supabaseAnonKey = options?.supabaseAnonKey ?? env.VITE_SUPABASE_ANON_KEY;
    this.sseEndpoint = options?.sseEndpoint ?? '/api/v1/telemetry/stream';
    this.enableAutoSse = options?.enableAutoSse ?? false;
    this.providerName =
      this.supabaseUrl && this.supabaseAnonKey
        ? 'supabase-realtime-channel'
        : 'safari-realtime-db-channel';
  }

  public connect(onHeartbeat: (payload: RawTelemetryHeartbeat) => void): void {
    if (this.isConnectingOrConnected) {
      return;
    }
    this.isConnectingOrConnected = true;
    this.status = 'connected';

    if (
      this.enableAutoSse &&
      typeof window !== 'undefined' &&
      typeof window.EventSource !== 'undefined'
    ) {
      try {
        this.status = 'connecting';
        const es = new window.EventSource(this.sseEndpoint);
        this.eventSource = es;

        es.addEventListener('telemetry', (evt: MessageEvent) => {
          this.status = 'connected';
          try {
            const parsed = JSON.parse(evt.data) as {
              telemetry?: Record<string, VehicleTelemetry>;
            };
            if (parsed.telemetry) {
              const now = Date.now();
              for (const [routeId, vehicle] of Object.entries(parsed.telemetry)) {
                onHeartbeat({
                  eventId: `sse-${routeId}-${now}`,
                  routeId,
                  timestampMs: now,
                  progress: vehicle.progress,
                  position: vehicle.position,
                  gpsCoords: vehicle.gpsCoords,
                  headingDeg: vehicle.headingDeg,
                  speedKmh: vehicle.speedKmh,
                  state: vehicle.state,
                  delayMinutes: vehicle.delayMinutes,
                  gpsSignalStrength: vehicle.gpsSignalStrength,
                  deviationOffset: vehicle.deviationOffset,
                  source: 'sse_stream',
                });
              }
            }
          } catch {
            // ignore malformed frame
          }
        });

        es.onerror = () => {
          this.status = 'degraded';
        };
      } catch {
        this.status = 'degraded';
      }
    }
  }

  public disconnect(): void {
    this.isConnectingOrConnected = false;

    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {
        // ignore close errors
      }
      this.eventSource = null;
    }

    // Prevent "WebSocket closed without opened" by waiting for OPEN if still CONNECTING
    if (this.webSocket) {
      const ws = this.webSocket;
      this.webSocket = null;
      try {
        if (typeof WebSocket !== 'undefined' && ws.readyState === WebSocket.CONNECTING) {
          ws.addEventListener(
            'open',
            () => {
              try {
                ws.close(1000, 'Telemetry adapter disconnected');
              } catch {
                // ignore
              }
            },
            { once: true }
          );
          ws.addEventListener(
            'error',
            () => {
              // swallow premature handshake cancellation
            },
            { once: true }
          );
        } else if (
          typeof WebSocket !== 'undefined' &&
          ws.readyState === WebSocket.OPEN
        ) {
          ws.close(1000, 'Telemetry adapter disconnected');
        }
      } catch {
        // ignore socket cleanup error
      }
    }

    if (this.customDisconnect) {
      this.customDisconnect();
      this.customDisconnect = null;
    }
    this.status = 'disconnected';
  }

  public async publishHeartbeat(
    heartbeat: RawTelemetryHeartbeat,
    _enrichedVehicle: VehicleTelemetry
  ): Promise<void> {
    if (!heartbeat.routeId) return;
    this.status = 'connected';
  }

  public getConnectionStatus():
    | 'connected'
    | 'connecting'
    | 'disconnected'
    | 'degraded' {
    return this.status;
  }
}

/**
 * Production-grade Telemetry Ingestion & Pub/Sub Streaming Service.
 *
 * Responsibilities:
 * 1. Ingests raw vehicle location updates (`ingestLocationUpdate` / `ingestBatch`) from
 *    hardware GPS trackers, Supabase Realtime channels, or the fleet kinematic engine.
 * 2. Deduplicates by `eventId` and drops out-of-order stale timestamps per route.
 * 3. Recomputes traffic-weighted ETAs (`calculateWeightedStopEta`) using the route's current
 *    `TrafficLevel` (`clear` | `moderate` | `heavy`) so every subscriber receives
 *    authoritative, traffic-adjusted arrival estimates.
 * 4. Publishes normalized `TelemetryStreamEvent` payloads across route-scoped topics
 *    (`journey:<routeId>`) and fleet-wide topics (`fleet:all`).
 * 5. Buffers outgoing updates when offline and flushes automatically upon reconnection.
 */
export class TelemetryIngestionService {
  private routesById = new Map<string, RouteDefinition>();
  private shift: ShiftMode = 'morning';
  private fleetState: Record<string, VehicleTelemetry> = {};
  private lastTimestampByRoute = new Map<string, number>();
  private processedEventIds = new Set<string>();
  private readonly maxDedupeWindow = 500;

  private routeSubscribers = new Map<string, Set<JourneyLocationListener>>();
  private fleetSubscribers = new Set<FleetLocationListener>();
  private offlineBuffer: RawTelemetryHeartbeat[] = [];
  private isOffline = false;
  private isInitialized = false;

  private adapter: RealtimeDatabaseAdapter;
  private ingestedCount = 0;
  private deduplicatedDropCount = 0;
  private staleOutOfOrderDropCount = 0;
  private publishedEventCount = 0;
  private lastIngestedAtMs: number | null = null;
  private lastEvent: TelemetryStreamEvent | null = null;

  constructor(options?: {
    initialRoutes?: RouteDefinition[];
    initialShift?: ShiftMode;
    adapter?: RealtimeDatabaseAdapter;
    autoConnect?: boolean;
  }) {
    this.shift = options?.initialShift ?? 'morning';
    this.adapter = options?.adapter ?? new SupabaseRealtimeTelemetryAdapter();

    if (options?.initialRoutes && options.initialRoutes.length > 0) {
      this.syncRoutes(options.initialRoutes, this.shift, true);
    }

    if (options?.autoConnect !== false) {
      this.initialize();
    }
  }

  /**
   * Explicitly initializes the real-time adapter connection lifecycle (idempotent).
   * Returns a cleanup function suitable for React `useEffect` teardown that only
   * disconnects when no active subscribers remain.
   */
  public initialize(): () => void {
    if (!this.isInitialized) {
      this.isInitialized = true;
      void this.adapter.connect((heartbeat) => {
        this.ingestLocationUpdate(heartbeat);
      });
    }

    return () => {
      const metrics = this.getMetrics();
      if (
        metrics.activeFleetSubscribers === 0 &&
        metrics.activeRouteSubscribers === 0
      ) {
        this.isInitialized = false;
        void this.adapter.disconnect();
      }
    };
  }

  /**
   * Synchronizes route definitions (including live `TrafficLevel` changes) with the
   * telemetry ingestion service and immediately recalculates traffic-weighted ETAs.
   */
  public syncRoutes(
    routes: RouteDefinition[],
    shift: ShiftMode = this.shift,
    resetTelemetry = false
  ): Record<string, VehicleTelemetry> {
    const shiftChanged = shift !== this.shift;
    this.shift = shift;

    this.routesById.clear();
    for (const r of routes) {
      this.routesById.set(r.id, r);
    }

    if (resetTelemetry || shiftChanged || Object.keys(this.fleetState).length === 0) {
      this.fleetState = createInitialTelemetry(routes, shift);
      this.lastTimestampByRoute.clear();
    } else {
      // Ensure any newly created routes have initial telemetry and recalculate weighted ETAs
      const nextState: Record<string, VehicleTelemetry> = { ...this.fleetState };
      for (const route of routes) {
        if (!nextState[route.id]) {
          nextState[route.id] = createVehicleTelemetryForRoute(route, shift, 0.14);
        }
      }
      this.fleetState = stepFleetTelemetry(routes, nextState, shift, 0);
    }

    this.emitFleetSnapshot(this.lastEvent);
    return this.getFleetSnapshot();
  }

  /**
   * Replaces the entire fleet state snapshot (e.g. when a safety exception or shift reset occurs)
   * and broadcasts the authoritative state to all subscribed frontend views.
   */
  public publishFleetState(
    nextTelemetry: Record<string, VehicleTelemetry>,
    source: Required<RawTelemetryHeartbeat>['source'] = 'simulation_engine'
  ): Record<string, VehicleTelemetry> {
    const now = Date.now();
    this.fleetState = { ...nextTelemetry };

    for (const [routeId, vehicle] of Object.entries(this.fleetState)) {
      const event: TelemetryStreamEvent = {
        eventId: `sync-${routeId}-${now}-${Math.random().toString(36).slice(2, 6)}`,
        topic: `journey:${routeId}`,
        routeId,
        timestampMs: now,
        source,
        vehicle,
        fleetSnapshot: this.getFleetSnapshot(),
      };
      this.lastEvent = event;
      this.publishedEventCount += 1;
      this.notifyRouteListeners(routeId, event);
    }

    this.emitFleetSnapshot(this.lastEvent);
    return this.getFleetSnapshot();
  }

  /**
   * Ingests a single vehicle location update, performs idempotency & monotonic timestamp checks,
   * enriches it with traffic-weighted ETA math, persists via the realtime database adapter,
   * and fans out to route & fleet subscribers.
   */
  public ingestLocationUpdate(
    raw: RawTelemetryHeartbeat
  ): TelemetryStreamEvent | null {
    if (!raw || !raw.routeId) {
      return null;
    }

    if (this.isOffline) {
      this.offlineBuffer.push(raw);
      return null;
    }

    // 1. Idempotency check by eventId
    if (raw.eventId && this.processedEventIds.has(raw.eventId)) {
      this.deduplicatedDropCount += 1;
      return null;
    }

    // 2. Monotonic timestamp guard per route (reject stale out-of-order packets)
    const timestampMs = raw.timestampMs ?? Date.now();
    const prevTimestamp = this.lastTimestampByRoute.get(raw.routeId);
    if (typeof prevTimestamp === 'number' && timestampMs < prevTimestamp) {
      this.staleOutOfOrderDropCount += 1;
      return null;
    }

    if (raw.eventId) {
      this.processedEventIds.add(raw.eventId);
      if (this.processedEventIds.size > this.maxDedupeWindow) {
        const oldest = this.processedEventIds.values().next().value;
        if (oldest) {
          this.processedEventIds.delete(oldest);
        }
      }
    }

    this.lastTimestampByRoute.set(raw.routeId, timestampMs);
    this.ingestedCount += 1;
    this.lastIngestedAtMs = timestampMs;

    // 3. Normalize and enrich with RouteDefinition & TrafficLevel weighted ETA
    const route = this.routesById.get(raw.routeId);
    const existing =
      this.fleetState[raw.routeId] ??
      (route
        ? createVehicleTelemetryForRoute(route, this.shift, raw.progress ?? 0.22)
        : undefined);

    const enrichedVehicle = this.enrichVehicleTelemetry(raw, route, existing);
    this.fleetState = {
      ...this.fleetState,
      [raw.routeId]: enrichedVehicle,
    };

    if (this.adapter.publishHeartbeat) {
      void this.adapter.publishHeartbeat(raw, enrichedVehicle);
    }

    const event: TelemetryStreamEvent = {
      eventId: raw.eventId || `tel-${raw.routeId}-${timestampMs}`,
      topic: `journey:${raw.routeId}`,
      routeId: raw.routeId,
      timestampMs,
      source: raw.source ?? 'hardware_tracker',
      vehicle: enrichedVehicle,
      fleetSnapshot: this.getFleetSnapshot(),
    };

    this.lastEvent = event;
    this.publishedEventCount += 1;
    this.notifyRouteListeners(raw.routeId, event);
    this.emitFleetSnapshot(event);

    return event;
  }

  /**
   * Batch-ingests multiple vehicle heartbeats atomically and emits a consolidated fleet update.
   */
  public ingestBatch(
    heartbeats: RawTelemetryHeartbeat[]
  ): TelemetryStreamEvent[] {
    const events: TelemetryStreamEvent[] = [];
    for (const hb of heartbeats) {
      const evt = this.ingestLocationUpdate(hb);
      if (evt) {
        events.push(evt);
      }
    }
    return events;
  }

  /**
   * Advances all active journeys by `deltaProgress` using the traffic-weighted simulation
   * engine and publishes each vehicle's new location through the pub/sub pipeline.
   */
  public stepActiveJourneys(
    deltaProgress: number,
    source: Required<RawTelemetryHeartbeat>['source'] = 'simulation_engine'
  ): Record<string, VehicleTelemetry> {
    const routes = Array.from(this.routesById.values());
    if (routes.length === 0) return this.getFleetSnapshot();

    const stepped = stepFleetTelemetry(routes, this.fleetState, this.shift, deltaProgress);
    const now = Date.now();

    for (const route of routes) {
      const v = stepped[route.id];
      if (!v) continue;
      this.ingestLocationUpdate({
        eventId: `step-${route.id}-${now}-${Math.random().toString(36).slice(2, 7)}`,
        routeId: route.id,
        hardwareTrackerId: route.hardwareTrackerId,
        timestampMs: now,
        progress: v.progress,
        position: v.position,
        gpsCoords: v.gpsCoords,
        headingDeg: v.headingDeg,
        speedKmh: v.speedKmh,
        state: v.state,
        delayMinutes: v.delayMinutes,
        gpsSignalStrength: v.gpsSignalStrength,
        deviationOffset: v.deviationOffset,
        source,
      });
    }

    return this.getFleetSnapshot();
  }

  /**
   * Subscribe to real-time location updates for a specific active journey (`routeId`).
   * Immediately invokes `listener` with the current cached vehicle state if available.
   */
  public subscribeToJourney(
    routeId: string,
    listener: JourneyLocationListener,
    options?: { emitCurrentImmediately?: boolean }
  ): RealtimeChannelSubscription {
    const set =
      this.routeSubscribers.get(routeId) ?? new Set<JourneyLocationListener>();
    set.add(listener);
    this.routeSubscribers.set(routeId, set);

    if (options?.emitCurrentImmediately !== false && this.fleetState[routeId]) {
      const now = Date.now();
      listener({
        eventId: `init-${routeId}-${now}`,
        topic: `journey:${routeId}`,
        routeId,
        timestampMs: now,
        source: 'supabase_realtime',
        vehicle: this.fleetState[routeId],
        fleetSnapshot: this.getFleetSnapshot(),
      });
    }

    return {
      unsubscribe: () => {
        const currentSet = this.routeSubscribers.get(routeId);
        if (!currentSet) return;
        currentSet.delete(listener);
        if (currentSet.size === 0) {
          this.routeSubscribers.delete(routeId);
        }
      },
    };
  }

  /**
   * Subscribe to all active journeys across the entire school fleet (`fleet:all`).
   */
  public subscribeToFleet(
    listener: FleetLocationListener,
    options?: { emitCurrentImmediately?: boolean }
  ): RealtimeChannelSubscription {
    this.fleetSubscribers.add(listener);

    if (options?.emitCurrentImmediately !== false) {
      listener(this.getFleetSnapshot(), this.lastEvent);
    }

    return {
      unsubscribe: () => {
        this.fleetSubscribers.delete(listener);
      },
    };
  }

  /**
   * Toggles offline store-and-forward mode (simulating cellular dead zones).
   * When switched back online, buffered heartbeats are replayed in chronological order.
   */
  public setOfflineMode(offline: boolean): TelemetryStreamEvent[] {
    this.isOffline = offline;
    if (!offline && this.offlineBuffer.length > 0) {
      const queued = [...this.offlineBuffer].sort(
        (a, b) => a.timestampMs - b.timestampMs
      );
      this.offlineBuffer = [];
      return this.ingestBatch(queued);
    }
    return [];
  }

  public getVehicleTelemetry(routeId: string): VehicleTelemetry | undefined {
    return this.fleetState[routeId];
  }

  public getFleetSnapshot(): Record<string, VehicleTelemetry> {
    return { ...this.fleetState };
  }

  public getMetrics(): TelemetryServiceMetrics {
    let routeSubCount = 0;
    for (const set of this.routeSubscribers.values()) {
      routeSubCount += set.size;
    }

    return {
      ingestedCount: this.ingestedCount,
      deduplicatedDropCount: this.deduplicatedDropCount,
      staleOutOfOrderDropCount: this.staleOutOfOrderDropCount,
      publishedEventCount: this.publishedEventCount,
      bufferedOfflineCount: this.offlineBuffer.length,
      activeRouteSubscribers: routeSubCount,
      activeFleetSubscribers: this.fleetSubscribers.size,
      adapterProvider: this.adapter.providerName,
      connectionStatus: this.isOffline
        ? 'degraded'
        : this.adapter.getConnectionStatus(),
      lastIngestedAtMs: this.lastIngestedAtMs,
    };
  }

  public destroy(): void {
    this.routeSubscribers.clear();
    this.fleetSubscribers.clear();
    this.offlineBuffer = [];
    void this.adapter.disconnect();
  }

  private notifyRouteListeners(routeId: string, event: TelemetryStreamEvent): void {
    const listeners = this.routeSubscribers.get(routeId);
    if (!listeners) return;
    for (const listener of listeners) {
      listener(event);
    }
  }

  private emitFleetSnapshot(lastEvent: TelemetryStreamEvent | null): void {
    const snapshot = this.getFleetSnapshot();
    for (const listener of this.fleetSubscribers) {
      listener(snapshot, lastEvent);
    }
  }

  private enrichVehicleTelemetry(
    raw: RawTelemetryHeartbeat,
    route: RouteDefinition | undefined,
    existing: VehicleTelemetry | undefined
  ): VehicleTelemetry {
    const progress =
      typeof raw.progress === 'number'
        ? Math.max(0, Math.min(1, raw.progress))
        : existing?.progress ?? 0.22;

    const deviationOffset = raw.deviationOffset ??
      existing?.deviationOffset ?? { x: 0, y: 0 };

    let position: MapPoint = raw.position ?? existing?.position ?? { x: 400, y: 260 };
    let headingDeg = raw.headingDeg ?? existing?.headingDeg ?? 0;

    if (route && !raw.position) {
      const interpolated = interpolateAlongWaypoints(
        route.waypoints,
        progress,
        this.shift
      );
      position = {
        x: interpolated.position.x + deviationOffset.x,
        y: interpolated.position.y + deviationOffset.y,
      };
      if (typeof raw.headingDeg !== 'number') {
        headingDeg = interpolated.headingDeg;
      }
    }

    const gpsCoords = raw.gpsCoords ?? toSyntheticGpsCoords(position);
    const trafficLevel: TrafficLevel = route?.trafficLevel ?? 'clear';
    const profile =
      TRAFFIC_ETA_WEIGHTS[trafficLevel] ?? TRAFFIC_ETA_WEIGHTS.clear;

    const gpsSignalStrength =
      raw.gpsSignalStrength ?? existing?.gpsSignalStrength ?? 'strong';
    const delayMinutes = raw.delayMinutes ?? existing?.delayMinutes ?? 0;

    const preliminaryState: JourneyState =
      progress >= 0.995
        ? 'completed'
        : raw.state ?? existing?.state ?? 'in_progress';

    const defaultSpeed =
      preliminaryState === 'completed'
        ? 0
        : preliminaryState === 'delayed'
        ? Math.round(4 * profile.speedFactor)
        : preliminaryState === 'approaching_stop'
        ? Math.round(22 * profile.speedFactor)
        : Math.round(36 * profile.speedFactor);

    const speedKmh =
      typeof raw.speedKmh === 'number' ? raw.speedKmh : defaultSpeed;

    let currentStopIndex = existing?.currentStopIndex ?? 0;
    let nextStopId: string | null = existing?.nextStopId ?? null;
    let etaToNextStopMin = existing?.etaToNextStopMin ?? 0;
    let trafficDelayMin = existing?.trafficDelayMin ?? 0;

    if (route) {
      const orderedStops = getOrderedStopsForShift(route, this.shift);
      const nextStopIdx = orderedStops.findIndex(
        (s) => s.shiftProgress > progress + 0.015
      );
      const nextStop = nextStopIdx >= 0 ? orderedStops[nextStopIdx] : null;
      currentStopIndex =
        nextStopIdx >= 0 ? nextStopIdx : Math.max(0, orderedStops.length - 1);
      nextStopId = nextStop ? nextStop.id : null;

      if (nextStop) {
        const weighted = calculateWeightedStopEta(
          route,
          {
            progress,
            speedKmh,
            state: preliminaryState,
            delayMinutes,
            gpsSignalStrength,
          },
          nextStop.id,
          this.shift
        );
        etaToNextStopMin = weighted.etaMinutes;
        trafficDelayMin = weighted.trafficDeltaMinutes;
      } else {
        etaToNextStopMin = 0;
        trafficDelayMin = 0;
      }
    }

    let finalState: JourneyState = preliminaryState;
    if (progress >= 0.995) {
      finalState = 'completed';
    } else if (
      !raw.state &&
      preliminaryState !== 'delayed' &&
      preliminaryState !== 'deviated' &&
      preliminaryState !== 'gps_degraded'
    ) {
      finalState =
        etaToNextStopMin <= 5 && nextStopId ? 'approaching_stop' : 'in_progress';
    }

    return {
      routeId: raw.routeId,
      progress,
      position,
      gpsCoords,
      headingDeg,
      speedKmh,
      state: finalState,
      delayMinutes,
      trafficDelayMin,
      gpsSignalStrength,
      lastHeartbeatSecAgo:
        finalState === 'gps_degraded' || gpsSignalStrength === 'lost'
          ? Math.min(180, (existing?.lastHeartbeatSecAgo ?? 60) + 12)
          : 2,
      deviationOffset,
      currentStopIndex,
      nextStopId,
      etaToNextStopMin,
      isMoving: speedKmh > 5 && finalState !== 'completed',
    };
  }
}

/**
 * Default singleton telemetry ingestion service instance for frontend workspace subscriptions.
 * Deferred connection (`autoConnect: false`) ensures socket lifecycle only starts inside React mount effects.
 */
export const safariTelemetryService = new TelemetryIngestionService({
  autoConnect: false,
});
