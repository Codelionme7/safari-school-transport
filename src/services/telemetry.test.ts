import assert from 'node:assert/strict';
import test from 'node:test';
import { SYNTHETIC_ROUTES } from '../data/syntheticData';
import {
  RawTelemetryHeartbeat,
  RealtimeDatabaseAdapter,
  TelemetryIngestionService,
  TelemetryStreamEvent,
} from './telemetry';

test('TelemetryIngestionService delivers pub/sub updates to route-specific subscribers and fleet subscribers', () => {
  const service = new TelemetryIngestionService({
    initialRoutes: SYNTHETIC_ROUTES,
    initialShift: 'morning',
  });

  const route04Events: TelemetryStreamEvent[] = [];
  const route07Events: TelemetryStreamEvent[] = [];
  let fleetUpdates = 0;

  const sub04 = service.subscribeToJourney(
    'route-04',
    (evt) => {
      route04Events.push(evt);
    },
    { emitCurrentImmediately: true }
  );

  const sub07 = service.subscribeToJourney(
    'route-07',
    (evt) => {
      route07Events.push(evt);
    },
    { emitCurrentImmediately: false }
  );

  const subFleet = service.subscribeToFleet(
    () => {
      fleetUpdates += 1;
    },
    { emitCurrentImmediately: false }
  );

  // Initial immediate emission on route-04
  assert.equal(route04Events.length, 1);
  assert.equal(route07Events.length, 0);

  // Ingest live hardware GPS update for route-04
  const ingested = service.ingestLocationUpdate({
    eventId: 'hb-04-001',
    routeId: 'route-04',
    hardwareTrackerId: 'HW-GPS-9041',
    timestampMs: 1700000001000,
    progress: 0.34,
    speedKmh: 33,
    source: 'hardware_tracker',
  });

  assert.ok(ingested);
  assert.equal(route04Events.length, 2);
  assert.equal(route04Events[1].vehicle.progress, 0.34);
  assert.equal(route04Events[1].vehicle.speedKmh, 33);
  assert.equal(route07Events.length, 0);
  assert.equal(fleetUpdates, 1);

  sub04.unsubscribe();
  sub07.unsubscribe();
  subFleet.unsubscribe();
  service.destroy();
});

test('TelemetryIngestionService deduplicates duplicate eventIds and drops stale out-of-order timestamps', () => {
  const service = new TelemetryIngestionService({
    initialRoutes: SYNTHETIC_ROUTES,
    initialShift: 'morning',
  });

  const first = service.ingestLocationUpdate({
    eventId: 'dup-evt-100',
    routeId: 'route-04',
    timestampMs: 1700000010000,
    progress: 0.31,
  });
  assert.ok(first);

  // 1. Duplicate eventId should be ignored
  const duplicate = service.ingestLocationUpdate({
    eventId: 'dup-evt-100',
    routeId: 'route-04',
    timestampMs: 1700000012000,
    progress: 0.35,
  });
  assert.equal(duplicate, null);

  // 2. Older timestamp than 1700000010000 should be dropped
  const stale = service.ingestLocationUpdate({
    eventId: 'stale-evt-099',
    routeId: 'route-04',
    timestampMs: 1700000005000,
    progress: 0.28,
  });
  assert.equal(stale, null);

  const metrics = service.getMetrics();
  assert.equal(metrics.ingestedCount, 1);
  assert.equal(metrics.deduplicatedDropCount, 1);
  assert.equal(metrics.staleOutOfOrderDropCount, 1);
  assert.equal(service.getVehicleTelemetry('route-04')?.progress, 0.31);

  service.destroy();
});

test('TelemetryIngestionService integrates with a real-time database adapter and enriches weighted ETA by TrafficLevel', () => {
  const adapterState: {
    callback: ((payload: RawTelemetryHeartbeat) => void) | null;
  } = { callback: null };
  const publishedToDb: RawTelemetryHeartbeat[] = [];

  const mockSupabaseAdapter: RealtimeDatabaseAdapter = {
    providerName: 'supabase-realtime-mock',
    connect(onHeartbeat) {
      adapterState.callback = onHeartbeat;
    },
    disconnect() {
      adapterState.callback = null;
    },
    publishHeartbeat(hb) {
      publishedToDb.push(hb);
    },
    getConnectionStatus() {
      return 'connected';
    },
  };

  const service = new TelemetryIngestionService({
    initialRoutes: SYNTHETIC_ROUTES,
    initialShift: 'morning',
    adapter: mockSupabaseAdapter,
  });

  assert.ok(adapterState.callback);

  // Push incoming update from the real-time DB channel
  adapterState.callback({
    eventId: 'supa-rt-001',
    routeId: 'route-04',
    timestampMs: 1700000020000,
    progress: 0.25,
    source: 'supabase_realtime',
  });

  const clearEta = service.getVehicleTelemetry('route-04')!.etaToNextStopMin;
  assert.equal(publishedToDb.length, 1);

  // Update route-04 TrafficLevel to heavy and verify traffic-weighted ETA increases
  const heavyRoutes = SYNTHETIC_ROUTES.map((r) =>
    r.id === 'route-04' ? { ...r, trafficLevel: 'heavy' as const } : r
  );
  service.syncRoutes(heavyRoutes, 'morning', false);

  const heavyEta = service.getVehicleTelemetry('route-04')!.etaToNextStopMin;
  assert.ok(
    heavyEta > clearEta,
    `Expected heavy traffic ETA (${heavyEta}m) > clear traffic ETA (${clearEta}m)`
  );

  service.destroy();
});

test('TelemetryIngestionService buffers updates while offline and flushes in chronological order on reconnect', () => {
  const service = new TelemetryIngestionService({
    initialRoutes: SYNTHETIC_ROUTES,
    initialShift: 'morning',
  });

  service.setOfflineMode(true);
  assert.equal(service.getMetrics().connectionStatus, 'degraded');

  // Queue two out-of-order updates while offline
  const r1 = service.ingestLocationUpdate({
    eventId: 'off-2',
    routeId: 'route-07',
    timestampMs: 1700000050000,
    progress: 0.64,
  });
  const r2 = service.ingestLocationUpdate({
    eventId: 'off-1',
    routeId: 'route-07',
    timestampMs: 1700000040000,
    progress: 0.58,
  });

  assert.equal(r1, null);
  assert.equal(r2, null);
  assert.equal(service.getMetrics().bufferedOfflineCount, 2);

  // Reconnect and flush chronologically (off-1 then off-2)
  const flushed = service.setOfflineMode(false);
  assert.equal(flushed.length, 2);
  assert.equal(flushed[0].eventId, 'off-1');
  assert.equal(flushed[1].eventId, 'off-2');
  assert.equal(service.getVehicleTelemetry('route-07')?.progress, 0.64);
  assert.equal(service.getMetrics().bufferedOfflineCount, 0);

  service.destroy();
});

test('TelemetryIngestionService supports deferred autoConnect: false initialization and subscriber-safe teardown', () => {
  let connectCalls = 0;
  let disconnectCalls = 0;

  const adapter: RealtimeDatabaseAdapter = {
    providerName: 'lifecycle-test-adapter',
    connect() {
      connectCalls += 1;
    },
    disconnect() {
      disconnectCalls += 1;
    },
    getConnectionStatus() {
      return connectCalls > disconnectCalls ? 'connected' : 'disconnected';
    },
  };

  const service = new TelemetryIngestionService({
    initialRoutes: SYNTHETIC_ROUTES,
    adapter,
    autoConnect: false,
  });

  // Should not connect during constructor when autoConnect is false
  assert.equal(connectCalls, 0);

  const cleanup1 = service.initialize();
  const cleanup2 = service.initialize();
  assert.equal(connectCalls, 1);

  const sub = service.subscribeToFleet(() => {});
  // Cleanup while a subscriber is still active should not disconnect
  cleanup1();
  assert.equal(disconnectCalls, 0);

  // Unsubscribe last listener, then run cleanup -> disconnects cleanly
  sub.unsubscribe();
  cleanup2();
  assert.equal(disconnectCalls, 1);

  service.destroy();
});
