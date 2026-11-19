import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ConfirmationAuditEntry,
  RouteDefinition,
  ShiftMode,
  StudentRecord,
  TrafficLevel,
} from '../types/safari';
import { TRAFFIC_ETA_WEIGHTS } from '../engine/simulation';
import { TrafficLevelBadge } from './RouteDefinitionCard';

export interface ArrivalAccuracyPoint {
  auditId: string;
  studentName: string;
  vehicleLabel: string;
  stopName: string;
  scheduledTime: string;
  actualTime: string;
  varianceMinutes: number;
  accuracyPercent: number;
  hasPhotoProof: boolean;
  method: ConfirmationAuditEntry['method'];
}

export interface RouteEfficiencyPoint {
  routeId: string;
  routeCode: string;
  routeName: string;
  vehicleLabel: string;
  trafficLevel: TrafficLevel;
  scheduledDurationMin: number;
  weightedDurationMin: number;
  efficiencyScorePercent: number;
  onTimeRatePercent: number;
  verifiedEventsCount: number;
  photoProofRatePercent: number;
  avgVarianceMinutes: number;
}

export interface TransportAnalyticsSummary {
  arrivalAccuracySeries: ArrivalAccuracyPoint[];
  routeEfficiencySeries: RouteEfficiencyPoint[];
  overallOnTimeRatePercent: number;
  avgArrivalVarianceMinutes: number;
  fleetEfficiencyScorePercent: number;
  qrVerificationSharePercent: number;
  photoProofSharePercent: number;
}

export function parseClockToMinutes(clock: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

/**
 * Pure analytics aggregation function that derives historical arrival accuracy
 * and route efficiency metrics from `auditLog`, `routes`, and `students`.
 */
export function buildTransportAnalytics(params: {
  auditLog: ConfirmationAuditEntry[];
  routes: RouteDefinition[];
  students: StudentRecord[];
  shift: ShiftMode;
}): TransportAnalyticsSummary {
  const { auditLog, routes, students, shift } = params;

  const studentById = new Map<string, StudentRecord>();
  for (const s of students) {
    studentById.set(s.id, s);
  }

  const routeById = new Map<string, RouteDefinition>();
  for (const r of routes) {
    routeById.set(r.id, r);
  }

  // Chronological order (oldest -> newest) for time-series visualization
  const chronologicalAudit = [...auditLog].reverse();

  const arrivalAccuracySeries: ArrivalAccuracyPoint[] = chronologicalAudit.map(
    (entry) => {
      const student = studentById.get(entry.studentId);
      const route = routeById.get(entry.routeId);
      let stop = route?.stops.find((st) => st.id === student?.stopId);
      if (entry.eventType === 'arrived_school') {
        stop = route?.stops.find((st) => st.isSchoolCampus) ?? stop;
      }

      const scheduledTime =
        (shift === 'morning'
          ? stop?.scheduledMorningTime
          : stop?.scheduledAfternoonTime) ?? entry.timestamp;

      const schedMins = parseClockToMinutes(scheduledTime);
      const actualMins = parseClockToMinutes(entry.timestamp);
      const rawVariance =
        schedMins !== null && actualMins !== null ? actualMins - schedMins : 0;
      const varianceMinutes = Math.max(-15, Math.min(25, rawVariance));
      const absVariance = Math.abs(varianceMinutes);
      // 100% when exact, -4% per minute of deviation beyond 0, floored at 60%
      const accuracyPercent = Math.max(60, Math.min(100, 100 - absVariance * 4));

      return {
        auditId: entry.id,
        studentName: entry.studentName,
        vehicleLabel: entry.vehicleLabel,
        stopName: stop?.name ?? 'Corridor Stop',
        scheduledTime,
        actualTime: entry.timestamp,
        varianceMinutes,
        accuracyPercent,
        hasPhotoProof: entry.hasPhotoProof,
        method: entry.method,
      };
    }
  );

  const routeEfficiencySeries: RouteEfficiencyPoint[] = routes.map((route) => {
    const profile =
      TRAFFIC_ETA_WEIGHTS[route.trafficLevel] ?? TRAFFIC_ETA_WEIGHTS.clear;
    const scheduledDurationMin = route.estimatedDurationMin;
    const weightedDurationMin = Math.round(
      scheduledDurationMin * profile.congestionMultiplier
    );

    const routeEvents = arrivalAccuracySeries.filter((pt) => {
      const entry = auditLog.find((a) => a.id === pt.auditId);
      return entry?.routeId === route.id;
    });

    const onTimeEvents = routeEvents.filter(
      (e) => Math.abs(e.varianceMinutes) <= 3
    ).length;
    const onTimeRatePercent =
      routeEvents.length > 0
        ? Math.round((onTimeEvents / routeEvents.length) * 100)
        : 100;

    const avgVarianceMinutes =
      routeEvents.length > 0
        ? Number(
            (
              routeEvents.reduce((acc, e) => acc + Math.abs(e.varianceMinutes), 0) /
              routeEvents.length
            ).toFixed(1)
          )
        : 1.0;

    const photoEvents = routeEvents.filter((e) => e.hasPhotoProof).length;
    const photoProofRatePercent =
      routeEvents.length > 0
        ? Math.round((photoEvents / routeEvents.length) * 100)
        : 100;

    // Route efficiency blends corridor duration ratio (scheduled / weighted) with audit on-time rate
    const durationRatioPercent = Math.round(
      (scheduledDurationMin / Math.max(1, weightedDurationMin)) * 100
    );
    const efficiencyScorePercent = Math.min(
      100,
      Math.round(durationRatioPercent * 0.55 + onTimeRatePercent * 0.45)
    );

    return {
      routeId: route.id,
      routeCode: route.code,
      routeName: route.name,
      vehicleLabel: route.vehicleLabel,
      trafficLevel: route.trafficLevel,
      scheduledDurationMin,
      weightedDurationMin,
      efficiencyScorePercent,
      onTimeRatePercent,
      verifiedEventsCount: routeEvents.length,
      photoProofRatePercent,
      avgVarianceMinutes,
    };
  });

  const totalEvents = arrivalAccuracySeries.length;
  const onTimeTotal = arrivalAccuracySeries.filter(
    (e) => Math.abs(e.varianceMinutes) <= 3
  ).length;
  const overallOnTimeRatePercent =
    totalEvents > 0 ? Math.round((onTimeTotal / totalEvents) * 100) : 100;

  const avgArrivalVarianceMinutes =
    totalEvents > 0
      ? Number(
          (
            arrivalAccuracySeries.reduce(
              (sum, e) => sum + Math.abs(e.varianceMinutes),
              0
            ) / totalEvents
          ).toFixed(1)
        )
      : 0;

  const fleetEfficiencyScorePercent =
    routeEfficiencySeries.length > 0
      ? Math.round(
          routeEfficiencySeries.reduce(
            (sum, r) => sum + r.efficiencyScorePercent,
            0
          ) / routeEfficiencySeries.length
        )
      : 100;

  const qrCount = auditLog.filter((a) => a.method === 'qr_scan').length;
  const qrVerificationSharePercent =
    auditLog.length > 0 ? Math.round((qrCount / auditLog.length) * 100) : 100;

  const photoCount = auditLog.filter((a) => a.hasPhotoProof).length;
  const photoProofSharePercent =
    auditLog.length > 0 ? Math.round((photoCount / auditLog.length) * 100) : 100;

  return {
    arrivalAccuracySeries,
    routeEfficiencySeries,
    overallOnTimeRatePercent,
    avgArrivalVarianceMinutes,
    fleetEfficiencyScorePercent,
    qrVerificationSharePercent,
    photoProofSharePercent,
  };
}

interface TransportAnalyticsProps {
  auditLog: ConfirmationAuditEntry[];
  routes: RouteDefinition[];
  students: StudentRecord[];
  shift: ShiftMode;
}

export const TransportAnalytics: React.FC<TransportAnalyticsProps> = ({
  auditLog,
  routes,
  students,
  shift,
}) => {
  const analytics = useMemo(
    () =>
      buildTransportAnalytics({
        auditLog,
        routes,
        students,
        shift,
      }),
    [auditLog, routes, students, shift]
  );

  const getTrafficBarColor = (level: TrafficLevel) => {
    if (level === 'heavy') return '#DC2626';
    if (level === 'moderate') return '#D97706';
    return '#10B981';
  };

  return (
    <section
      aria-label="Transport analytics and historical arrival accuracy"
      data-testid="transport-analytics-panel"
      className="space-y-6"
    >
      {/* Analytics Summary Strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="glass-card rounded-[22px] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748B] dark:text-slate-400">
            Arrival Accuracy (±3m)
          </p>
          <p
            data-testid="analytics-ontime-rate"
            className="font-mono-tabular mt-2 text-2xl font-extrabold tracking-tight text-[#10B981]"
          >
            {analytics.overallOnTimeRatePercent}%
          </p>
          <p className="mt-1 text-xs text-[#64748B] dark:text-slate-400">
            Across {auditLog.length} audited handover events
          </p>
        </div>

        <div className="glass-card rounded-[22px] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748B] dark:text-slate-400">
            Mean Schedule Variance
          </p>
          <p
            data-testid="analytics-mean-variance"
            className="font-mono-tabular mt-2 text-2xl font-extrabold tracking-tight text-[#111827] dark:text-white"
          >
            ±{analytics.avgArrivalVarianceMinutes} min
          </p>
          <p className="mt-1 text-xs text-[#64748B] dark:text-slate-400">
            Actual vs. scheduled stop window
          </p>
        </div>

        <div className="glass-card rounded-[22px] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748B] dark:text-slate-400">
            Fleet Efficiency Index
          </p>
          <p
            data-testid="analytics-efficiency-score"
            className="font-mono-tabular mt-2 text-2xl font-extrabold tracking-tight text-[#111827] dark:text-white"
          >
            {analytics.fleetEfficiencyScorePercent}%
          </p>
          <p className="mt-1 text-xs text-[#64748B] dark:text-slate-400">
            Schedule baseline vs. traffic load
          </p>
        </div>

        <div className="glass-card rounded-[22px] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748B] dark:text-slate-400">
            QR + Photo Compliance
          </p>
          <p className="font-mono-tabular mt-2 text-2xl font-extrabold tracking-tight text-[#111827] dark:text-white">
            {analytics.qrVerificationSharePercent}% / {analytics.photoProofSharePercent}%
          </p>
          <p className="mt-1 text-xs text-[#64748B] dark:text-slate-400">
            QR pass scans / doorway photo proofs
          </p>
        </div>
      </div>

      {/* Two-Column Recharts Visualization Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Chart 1: Historical Arrival Accuracy & Schedule Variance from auditLog */}
        <div className="glass-card rounded-[24px] p-5">
          <div className="border-b border-gray-200/70 pb-3 dark:border-white/10">
            <h3 className="text-sm font-bold text-[#111827] dark:text-white">
              Historical Arrival Accuracy &amp; Stop Variance (Audit Log)
            </h3>
            <p className="mt-0.5 text-xs text-[#64748B] dark:text-slate-400">
              Compares each audited boarding/handover timestamp against the stop’s scheduled time window.
            </p>
          </div>

          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={analytics.arrivalAccuracySeries}
                margin={{ top: 10, right: 16, left: -12, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="studentName"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                />
                <YAxis
                  yAxisId="accuracy"
                  domain={[50, 100]}
                  unit="%"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                />
                <YAxis
                  yAxisId="variance"
                  orientation="right"
                  domain={[-5, 15]}
                  unit="m"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '14px',
                    border: '1px solid #E5E7EB',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line
                  yAxisId="accuracy"
                  type="monotone"
                  dataKey="accuracyPercent"
                  name="Arrival Accuracy (%)"
                  stroke="#10B981"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#10B981' }}
                />
                <Line
                  yAxisId="variance"
                  type="monotone"
                  dataKey="varianceMinutes"
                  name="Schedule Variance (min)"
                  stroke="#111827"
                  strokeWidth={2}
                  dot={{ r: 3.5, fill: '#111827' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Route Efficiency & Traffic-Weighted Duration Comparison */}
        <div className="glass-card rounded-[24px] p-5">
          <div className="border-b border-gray-200/70 pb-3 dark:border-white/10">
            <h3 className="text-sm font-bold text-[#111827] dark:text-white">
              Corridor Route Efficiency &amp; Traffic-Weighted Duration
            </h3>
            <p className="mt-0.5 text-xs text-[#64748B] dark:text-slate-400">
              Baseline scheduled minutes vs. traffic-weighted corridor duration and efficiency score per route.
            </p>
          </div>

          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analytics.routeEfficiencySeries}
                margin={{ top: 10, right: 16, left: -12, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="vehicleLabel"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                />
                <YAxis
                  unit="m"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '14px',
                    border: '1px solid #E5E7EB',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar
                  dataKey="scheduledDurationMin"
                  name="Scheduled Baseline (min)"
                  fill="#111827"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="weightedDurationMin"
                  name="Traffic-Weighted Est. (min)"
                  radius={[6, 6, 0, 0]}
                >
                  {analytics.routeEfficiencySeries.map((entry) => (
                    <Cell
                      key={entry.routeId}
                      fill={getTrafficBarColor(entry.trafficLevel)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Per-Route Efficiency & Audit Breakdown Table */}
      <div className="glass-card overflow-hidden rounded-[24px]">
        <div className="border-b border-gray-200/70 px-5 py-4 dark:border-white/10">
          <h3 className="text-sm font-bold text-[#111827] dark:text-white">
            Route-by-Route Efficiency &amp; Handover Audit Scorecard
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200/70 bg-gray-50/70 text-[11px] uppercase tracking-wider text-[#64748B] dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                <th className="px-5 py-3 font-semibold">Route &amp; Vehicle</th>
                <th className="px-4 py-3 font-semibold">Road Condition</th>
                <th className="px-4 py-3 font-semibold">Baseline vs. Weighted</th>
                <th className="px-4 py-3 font-semibold">Audited Events</th>
                <th className="px-4 py-3 font-semibold">Mean Variance</th>
                <th className="px-5 py-3 text-right font-semibold">Efficiency Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200/60 dark:divide-white/10">
              {analytics.routeEfficiencySeries.map((row) => (
                <tr
                  key={row.routeId}
                  className="transition-colors hover:bg-white/70 dark:hover:bg-white/5"
                >
                  <td className="px-5 py-3.5 font-semibold text-[#111827] dark:text-white">
                    {row.vehicleLabel} · {row.routeName}{' '}
                    <span className="font-mono-tabular text-[11px] font-normal text-[#64748B] dark:text-slate-400">
                      ({row.routeCode})
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <TrafficLevelBadge
                      trafficLevel={row.trafficLevel}
                      showMultiplier
                    />
                  </td>
                  <td className="font-mono-tabular px-4 py-3.5 text-[#374151] dark:text-slate-300">
                    {row.scheduledDurationMin}m → {row.weightedDurationMin}m
                  </td>
                  <td className="font-mono-tabular px-4 py-3.5 text-[#374151] dark:text-slate-300">
                    {row.verifiedEventsCount} ({row.photoProofRatePercent}% photo)
                  </td>
                  <td className="font-mono-tabular px-4 py-3.5 text-[#374151] dark:text-slate-300">
                    ±{row.avgVarianceMinutes} min
                  </td>
                  <td className="font-mono-tabular px-5 py-3.5 text-right font-bold text-[#10B981]">
                    {row.efficiencyScorePercent}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
