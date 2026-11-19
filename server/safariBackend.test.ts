import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BACKEND_IMPROVEMENT_RECOMMENDATIONS,
  SafariBackendStore,
} from './safariBackend';
import { TRAFFIC_BADGE_CONFIG } from '../src/components/RouteDefinitionCard';

test('TRAFFIC_BADGE_CONFIG maps clear/moderate/heavy to Green (Low), Yellow (Moderate), and Red (Heavy) badges', () => {
  assert.equal(TRAFFIC_BADGE_CONFIG.clear.shortLabel, 'Low');
  assert.ok(TRAFFIC_BADGE_CONFIG.clear.badgeCls.includes('emerald'));

  assert.equal(TRAFFIC_BADGE_CONFIG.moderate.shortLabel, 'Moderate');
  assert.ok(TRAFFIC_BADGE_CONFIG.moderate.badgeCls.includes('amber'));

  assert.equal(TRAFFIC_BADGE_CONFIG.heavy.shortLabel, 'Heavy');
  assert.ok(TRAFFIC_BADGE_CONFIG.heavy.badgeCls.includes('red'));
});

test('SafariBackendStore initializes with a verified SHA-256 hash-chained audit ledger', () => {
  const store = new SafariBackendStore();
  const integrity = store.verifyAuditChainIntegrity();
  assert.equal(integrity.valid, true);
  assert.equal(integrity.entryCount, 3);
  assert.equal(integrity.headHash.length, 16);
});

test('SafariBackendStore enforces Visibility Without Exposure in parent-scoped view', () => {
  const store = new SafariBackendStore();
  const parentView = store.getParentScopedView('stu-01');
  assert.ok(parentView);
  assert.equal(parentView.student.id, 'stu-01');
  assert.equal(parentView.route.stops.length, 2); // Assigned stop + school campus only
  assert.ok(parentView.hiddenStopCount >= 2);
  assert.ok(parentView.hiddenBusCount >= 2);
});

test('SafariBackendStore recalculates weighted stop ETAs immediately when TrafficLevel changes', () => {
  const store = new SafariBackendStore();
  const clearEtas = store.calculateRouteStopEtas('route-04');
  assert.ok(clearEtas);
  const clearMaple = clearEtas.stops.find((s) => s.stopId === 'stop-nr-2')!;

  const updated = store.updateRoute('route-04', { trafficLevel: 'heavy' });
  assert.ok(updated);
  assert.equal(updated.trafficLevel, 'heavy');

  const heavyEtas = store.calculateRouteStopEtas('route-04');
  assert.ok(heavyEtas);
  const heavyMaple = heavyEtas.stops.find((s) => s.stopId === 'stop-nr-2')!;

  assert.ok(heavyMaple.estimate.etaMinutes > clearMaple.estimate.etaMinutes);
  assert.ok(
    heavyMaple.estimate.trafficDeltaMinutes > clearMaple.estimate.trafficDeltaMinutes
  );
});

test('SafariBackendStore appends tamper-evident SHA-256 hash chain on QR boarding confirmation and rejects wrong-route passes', () => {
  const store = new SafariBackendStore();
  const initialHead = store.verifyAuditChainIntegrity().headHash;

  // Reject wrong-route QR pass (Amina is on route-07, scanning on route-04)
  const wrongBus = store.recordHandoverConfirmation({
    qrCodeInput: 'SAF-WM07-05',
    activeRouteId: 'route-04',
    status: 'boarded',
    method: 'qr_scan',
  });
  assert.equal(wrongBus.ok, false);
  if (!wrongBus.ok) {
    assert.equal(wrongBus.errorCode, 'WRONG_ROUTE');
  }

  // Confirm valid QR pass for Maya on route-04
  const validScan = store.recordHandoverConfirmation({
    qrCodeInput: 'SAF-NR04-01',
    activeRouteId: 'route-04',
    status: 'boarded',
    method: 'qr_scan',
    hasPhotoProof: true,
  });
  assert.equal(validScan.ok, true);
  if (validScan.ok) {
    assert.equal(validScan.student.boardingStatus, 'boarded');
    assert.ok(validScan.auditEntry);
    assert.equal(validScan.auditEntry.prevHash, initialHead);
  }

  const afterIntegrity = store.verifyAuditChainIntegrity();
  assert.equal(afterIntegrity.valid, true);
  assert.equal(afterIntegrity.entryCount, 4);
  assert.notEqual(afterIntegrity.headHash, initialHead);
});

test('BACKEND_IMPROVEMENT_RECOMMENDATIONS contains 5 detailed architectural proposals', () => {
  assert.equal(BACKEND_IMPROVEMENT_RECOMMENDATIONS.length, 5);
  for (const rec of BACKEND_IMPROVEMENT_RECOMMENDATIONS) {
    assert.ok(rec.title.length > 10);
    assert.ok(rec.problemStatement.length > 20);
    assert.ok(rec.proposedArchitecture.length > 20);
    assert.ok(rec.measurableImpact.length > 10);
  }
});
