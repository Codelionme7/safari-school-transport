import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INITIAL_AUDIT_LOG,
  INITIAL_STUDENTS,
  SYNTHETIC_ROUTES,
} from '../data/syntheticData';
import {
  buildTransportAnalytics,
  parseClockToMinutes,
} from './TransportAnalytics';

test('parseClockToMinutes parses HH:MM strings accurately', () => {
  assert.equal(parseClockToMinutes('06:53'), 6 * 60 + 53);
  assert.equal(parseClockToMinutes('16:05'), 16 * 60 + 5);
  assert.equal(parseClockToMinutes('invalid'), null);
});

test('buildTransportAnalytics derives arrival accuracy and route efficiency series from auditLog', () => {
  const summary = buildTransportAnalytics({
    auditLog: INITIAL_AUDIT_LOG,
    routes: SYNTHETIC_ROUTES,
    students: INITIAL_STUDENTS,
    shift: 'morning',
  });

  assert.equal(summary.arrivalAccuracySeries.length, INITIAL_AUDIT_LOG.length);
  assert.equal(summary.routeEfficiencySeries.length, SYNTHETIC_ROUTES.length);

  // Initial audit events are all within +1 min of their scheduled stop window (06:52 -> 06:53, 06:48 -> 06:49, 06:50 -> 06:51)
  for (const point of summary.arrivalAccuracySeries) {
    assert.equal(point.varianceMinutes, 1);
    assert.equal(point.accuracyPercent, 96);
  }

  assert.equal(summary.overallOnTimeRatePercent, 100);
  assert.equal(summary.avgArrivalVarianceMinutes, 1);
  assert.equal(summary.qrVerificationSharePercent, 100);
  assert.equal(summary.photoProofSharePercent, 100);

  // Route with moderate traffic (route-07) has higher weighted duration than scheduled baseline
  const route04 = summary.routeEfficiencySeries.find((r) => r.routeId === 'route-04')!;
  const route07 = summary.routeEfficiencySeries.find((r) => r.routeId === 'route-07')!;
  assert.equal(route04.weightedDurationMin, route04.scheduledDurationMin);
  assert.ok(route07.weightedDurationMin > route07.scheduledDurationMin);
  assert.ok(route04.efficiencyScorePercent > route07.efficiencyScorePercent);
});
