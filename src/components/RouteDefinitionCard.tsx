import React from 'react';
import { RouteDefinition, TrafficLevel } from '../types/safari';
import { TRAFFIC_ETA_WEIGHTS } from '../engine/simulation';

export interface TrafficBadgeMeta {
  level: TrafficLevel;
  label: string;
  shortLabel: string;
  etaMultiplierLabel: string;
  weightMixLabel: string;
  dotCls: string;
  badgeCls: string;
}

export const TRAFFIC_BADGE_CONFIG: Record<TrafficLevel, TrafficBadgeMeta> = {
  clear: {
    level: 'clear',
    label: 'Low Traffic',
    shortLabel: 'Low',
    etaMultiplierLabel: '1.0x ETA',
    weightMixLabel: '65% sched / 35% live',
    dotCls: 'bg-emerald-500',
    badgeCls:
      'border-emerald-200/90 bg-emerald-50/90 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/60 dark:text-emerald-300',
  },
  moderate: {
    level: 'moderate',
    label: 'Moderate Traffic',
    shortLabel: 'Moderate',
    etaMultiplierLabel: '1.35x ETA',
    weightMixLabel: '45% sched / 55% live',
    dotCls: 'bg-amber-500',
    badgeCls:
      'border-amber-200/90 bg-amber-50/90 text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300',
  },
  heavy: {
    level: 'heavy',
    label: 'Heavy Traffic',
    shortLabel: 'Heavy',
    etaMultiplierLabel: '1.85x ETA',
    weightMixLabel: '30% sched / 70% live',
    dotCls: 'bg-red-500',
    badgeCls:
      'border-red-200/90 bg-red-50/90 text-red-800 dark:border-red-800/70 dark:bg-red-950/60 dark:text-red-300',
  },
};

export const TrafficLevelBadge: React.FC<{
  trafficLevel: TrafficLevel;
  showMultiplier?: boolean;
  testId?: string;
}> = ({ trafficLevel, showMultiplier = false, testId }) => {
  const cfg = TRAFFIC_BADGE_CONFIG[trafficLevel] ?? TRAFFIC_BADGE_CONFIG.clear;

  return (
    <span
      data-testid={testId ?? `traffic-badge-${trafficLevel}`}
      data-traffic-level={trafficLevel}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${cfg.badgeCls}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dotCls}`}
      />
      <span>{cfg.shortLabel}</span>
      {showMultiplier && (
        <span className="font-mono-tabular opacity-80">· {cfg.etaMultiplierLabel}</span>
      )}
    </span>
  );
};

export interface RouteDefinitionCardProps {
  route: RouteDefinition;
  assignedStudentCount: number;
  boardedStudentCount?: number;
  speedKmh?: number;
  etaToNextStopMin?: number;
  stateLabel?: string;
  stateClassName?: string;
  gpsLabel?: string;
  isSelected?: boolean;
  compact?: boolean;
  onSelect?: () => void;
  onTrafficChange?: (nextLevel: TrafficLevel) => void;
  onEdit?: () => void;
}

/**
 * Reusable RouteDefinition presenter that visualizes `TrafficLevel` with color-coded
 * Green (Low), Yellow (Moderate), and Red (Heavy) road-condition badges alongside
 * corridor telemetry, vehicle assignment, and weighted ETA factors.
 */
export const RouteDefinitionCard: React.FC<RouteDefinitionCardProps> = ({
  route,
  assignedStudentCount,
  boardedStudentCount,
  speedKmh,
  etaToNextStopMin,
  stateLabel,
  stateClassName,
  gpsLabel,
  isSelected = false,
  compact = false,
  onSelect,
  onTrafficChange,
  onEdit,
}) => {
  const weightProfile =
    TRAFFIC_ETA_WEIGHTS[route.trafficLevel] ?? TRAFFIC_ETA_WEIGHTS.clear;
  const trafficAdjustedDurationMin = Math.round(
    route.estimatedDurationMin * weightProfile.congestionMultiplier
  );

  if (compact) {
    return (
      <div
        data-testid={`fleet-route-card-${route.id}`}
        className={`rounded-2xl p-3 transition-all ${
          isSelected
            ? 'border-2 border-[#111827] bg-white/95 shadow-sm dark:border-white dark:bg-white/10'
            : 'glass-subcard hover:bg-white/85 dark:hover:bg-white/10'
        }`}
      >
        <button
          type="button"
          aria-label={`Inspect ${route.vehicleLabel} on ${route.name}`}
          onClick={onSelect}
          className="flex w-full items-start justify-between gap-2.5 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm font-bold text-[#111827] dark:text-white">
                {route.vehicleLabel} · {route.name}
              </p>
              <TrafficLevelBadge
                trafficLevel={route.trafficLevel}
                testId={`fleet-traffic-badge-${route.id}`}
              />
            </div>

            <p className="mt-1 text-xs text-[#64748B] dark:text-slate-400">
              {route.driverName} ({route.driverStatus.replace('_', ' ')}) ·{' '}
              <span className="font-mono-tabular">
                {typeof speedKmh === 'number' ? `${speedKmh} km/h` : '0 km/h'}
              </span>
              {' · '}
              <span className="font-mono-tabular">
                {route.totalDistanceKm} km / ~{trafficAdjustedDurationMin}m
              </span>
            </p>

            {stateLabel && (
              <p className={`mt-1 text-xs font-semibold ${stateClassName ?? ''}`}>
                {stateLabel}
                {typeof etaToNextStopMin === 'number' && etaToNextStopMin > 0
                  ? ` · Next ETA ${etaToNextStopMin}m`
                  : ''}
              </p>
            )}
          </div>

          <div className="shrink-0 text-right">
            <p className="font-mono-tabular text-xs font-bold text-[#111827] dark:text-white">
              {typeof boardedStudentCount === 'number'
                ? `${boardedStudentCount}/${assignedStudentCount}`
                : assignedStudentCount}
            </p>
            <p className="text-[11px] text-[#64748B] dark:text-slate-400">on board</p>
          </div>
        </button>

        {onTrafficChange && (
          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-gray-200/70 pt-2 text-[11px] dark:border-white/10">
            <span className="font-mono-tabular text-[#64748B] dark:text-slate-400">
              {gpsLabel ?? route.code}
            </span>
            <select
              aria-label={`Live traffic for ${route.vehicleLabel}`}
              value={route.trafficLevel}
              onChange={(e) => onTrafficChange(e.target.value as TrafficLevel)}
              className="h-7 rounded-full border border-gray-200 bg-white/90 px-2.5 text-[11px] font-semibold text-[#111827] focus:border-[#111827] focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-white"
            >
              <option value="clear">Traffic: Low (Clear)</option>
              <option value="moderate">Traffic: Moderate</option>
              <option value="heavy">Traffic: Heavy</option>
            </select>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid={`route-definition-row-${route.id}`}
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-[#111827] dark:text-white">
            {route.name}
          </span>
          <span className="font-mono-tabular rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-[#374151] dark:bg-white/10 dark:text-slate-200">
            {route.code}
          </span>
          <TrafficLevelBadge
            trafficLevel={route.trafficLevel}
            showMultiplier
            testId={`route-manager-traffic-badge-${route.id}`}
          />
          <span className="text-xs text-[#64748B] dark:text-slate-400">
            · {route.vehicleLabel} ({route.plateNumber})
          </span>
          <span className="text-xs font-medium text-[#64748B] tabular-nums dark:text-slate-400">
            · {assignedStudentCount} students
          </span>
        </div>

        <p className="text-xs text-[#64748B] dark:text-slate-400">
          Driver:{' '}
          <span className="font-semibold text-[#111827] dark:text-white">
            {route.driverName}
          </span>{' '}
          ({route.driverStatus.replace('_', ' ')}) · Attendant:{' '}
          <span className="font-semibold text-[#111827] dark:text-white">
            {route.attendantName}
          </span>{' '}
          · Tracker <span className="font-mono-tabular">{route.hardwareTrackerId}</span>
        </p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#64748B] dark:text-slate-400">
          <span className="font-mono-tabular">
            Corridor: {route.totalDistanceKm} km · Base {route.estimatedDurationMin}m →
            Weighted ~{trafficAdjustedDurationMin}m (
            {Math.round(weightProfile.scheduleWeight * 100)}% sched /{' '}
            {Math.round(weightProfile.liveSpeedWeight * 100)}% live)
          </span>
          <span aria-hidden="true">·</span>
          <span>Stops: {route.stops.map((s) => s.name).join(' → ')}</span>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {onTrafficChange && (
          <select
            aria-label={`Traffic level for ${route.name}`}
            value={route.trafficLevel}
            onChange={(e) => onTrafficChange(e.target.value as TrafficLevel)}
            className="h-9 rounded-full border border-gray-200 bg-white/85 px-3 text-xs font-semibold text-[#111827] focus:border-[#111827] focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-white"
          >
            <option value="clear">Traffic: Low (Clear)</option>
            <option value="moderate">Traffic: Moderate</option>
            <option value="heavy">Traffic: Heavy</option>
          </select>
        )}

        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit route ${route.name}`}
            className="btn-spring glass-subcard inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-[#111827] whitespace-nowrap transition-colors hover:border-[#111827] hover:bg-white dark:text-white dark:hover:bg-white/10"
          >
            <span>Edit &amp; Reassign</span>
          </button>
        )}
      </div>
    </div>
  );
};
