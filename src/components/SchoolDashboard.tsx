import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  Pause,
  Play,
  QrCode,
  RotateCcw,
  Route,
  Search,
  Send,
  ShieldAlert,
} from 'lucide-react';
import {
  ConfirmationAuditEntry,
  RouteDefinition,
  SafetyAlert,
  ShiftMode,
  StudentRecord,
  TrafficLevel,
  VehicleTelemetry,
} from '../types/safari';
import { formatGpsCoords } from '../engine/simulation';
import { RouteDefinitionCard } from './RouteDefinitionCard';
import { SyntheticRouteMap } from './SyntheticRouteMap';
import { SchoolRouteManager } from './SchoolRouteManager';
import { TransportAnalytics } from './TransportAnalytics';

interface SchoolDashboardProps {
  routes: RouteDefinition[];
  students: StudentRecord[];
  telemetry: Record<string, VehicleTelemetry>;
  alerts: SafetyAlert[];
  auditLog: ConfirmationAuditEntry[];
  shift: ShiftMode;
  isSimRunning: boolean;
  simSpeed: 1 | 3 | 8;
  onToggleSim: () => void;
  onChangeSimSpeed: (speed: 1 | 3 | 8) => void;
  onShiftChange: (shift: ShiftMode) => void;
  onResetSimulation: () => void;
  onTriggerException: (
    type: 'extended_delay' | 'route_deviation' | 'gps_loss' | 'student_not_boarded',
    routeId: string
  ) => void;
  onResolveAlertAndBroadcast: (alertId: string) => void;
  onCreateRoute: (input: {
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
  }) => void;
  onUpdateRoute: (
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
  ) => void;
  onAddStudent: (input: {
    firstName: string;
    lastName: string;
    grade: string;
    routeId: string;
    stopId: string;
    guardianName: string;
    authorizedBackupGuardian: string;
  }) => void;
  onReassignStudent: (studentId: string, routeId: string, stopId: string) => void;
  onRemoveStudent: (studentId: string) => void;
}

export const SchoolDashboard: React.FC<SchoolDashboardProps> = ({
  routes,
  students,
  telemetry,
  alerts,
  auditLog,
  shift,
  isSimRunning,
  simSpeed,
  onToggleSim,
  onChangeSimSpeed,
  onShiftChange,
  onResetSimulation,
  onTriggerException,
  onResolveAlertAndBroadcast,
  onCreateRoute,
  onUpdateRoute,
  onAddStudent,
  onReassignStudent,
  onRemoveStudent,
}) => {
  const [adminTab, setAdminTab] = useState<'live' | 'routes' | 'audit' | 'analytics'>(
    'live'
  );
  const [selectedRouteId, setSelectedRouteId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const activeAlerts = alerts.filter((a) => !a.resolved);
  const boardedCount = students.filter(
    (s) => s.boardingStatus === 'boarded' || s.boardingStatus === 'dropped_off'
  ).length;
  const nominalBuses = routes.filter((r) => {
    const t = telemetry[r.id];
    return (
      t &&
      t.state !== 'delayed' &&
      t.state !== 'deviated' &&
      t.state !== 'gps_degraded'
    );
  }).length;
  const congestedRoutesCount = routes.filter((r) => r.trafficLevel !== 'clear').length;

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (selectedRouteId !== 'all' && s.routeId !== selectedRouteId) return false;
      if (statusFilter !== 'all' && s.boardingStatus !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const full = `${s.firstName} ${s.lastName} ${s.guardianName} ${s.grade} ${s.qrCodeId}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });
  }, [students, selectedRouteId, statusFilter, searchQuery]);

  const targetRouteForTriggers =
    selectedRouteId === 'all' ? routes[0]?.id ?? 'route-04' : selectedRouteId;

  const formatVehicleState = (state: VehicleTelemetry['state']) => {
    switch (state) {
      case 'approaching_stop':
        return { label: 'Approaching Stop', cls: 'text-[#111827] dark:text-white' };
      case 'in_progress':
        return { label: 'Nominal · En Route', cls: 'text-[#10B981] dark:text-emerald-400' };
      case 'completed':
        return { label: 'Journey Completed', cls: 'text-[#10B981] dark:text-emerald-400' };
      case 'delayed':
        return { label: 'Extended Delay', cls: 'text-amber-700 dark:text-amber-400' };
      case 'deviated':
        return { label: 'Route Deviation', cls: 'text-red-600 dark:text-red-400' };
      case 'gps_degraded':
        return { label: 'GPS Degraded', cls: 'text-amber-700 dark:text-amber-400' };
      default:
        return { label: 'Not Started', cls: 'text-[#64748B] dark:text-slate-400' };
    }
  };

  const accountedPct =
    students.length > 0 ? Math.round((boardedCount / students.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header & Simulation Control Bar */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B] dark:text-slate-400">
            School Operations · Oakridge Academy Transport Office
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#111827] dark:text-white">
            Live Fleet, Route Management &amp; Accountability
          </h1>
        </div>

        {/* Transport Simulation Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="glass-card inline-flex rounded-full p-1">
            <button
              type="button"
              onClick={() => onShiftChange('morning')}
              className={`min-h-[34px] rounded-full px-3.5 py-1 text-xs font-semibold whitespace-nowrap transition-all ${
                shift === 'morning'
                  ? 'bg-[#111827] text-white shadow-sm dark:bg-white dark:text-[#111827]'
                  : 'text-[#64748B] hover:text-[#111827] dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Morning
            </button>
            <button
              type="button"
              onClick={() => onShiftChange('afternoon')}
              className={`min-h-[34px] rounded-full px-3.5 py-1 text-xs font-semibold whitespace-nowrap transition-all ${
                shift === 'afternoon'
                  ? 'bg-[#111827] text-white shadow-sm dark:bg-white dark:text-[#111827]'
                  : 'text-[#64748B] hover:text-[#111827] dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Afternoon
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleSim}
            className="btn-spring btn-obsidian gleam-sweep inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold whitespace-nowrap"
          >
            {isSimRunning ? (
              <>
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Pause Fleet</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Resume Fleet</span>
              </>
            )}
          </button>

          <div
            role="group"
            aria-label="Simulation speed"
            className="glass-card inline-flex rounded-full p-1"
          >
            {([1, 3, 8] as const).map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => onChangeSimSpeed(spd)}
                className={`min-h-[32px] rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums whitespace-nowrap transition-all ${
                  simSpeed === spd
                    ? 'bg-[#111827] text-white shadow-sm dark:bg-white dark:text-[#111827]'
                    : 'text-[#64748B] hover:text-[#111827] dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onResetSimulation}
            className="btn-spring glass-card inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-[#111827] whitespace-nowrap transition-colors hover:bg-white/95 dark:text-white dark:hover:bg-white/10"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset Trip</span>
          </button>
        </div>
      </div>

      {/* 4-Column Executive Monochrome KPI Grid (1 Featured Dark Hero + 3 Frosted Glass) */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="glass-card-dark relative overflow-hidden rounded-[22px] p-5 text-white">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">
              Active Fleet
            </p>
            <span className="inline-flex h-2 w-2 rounded-full bg-[#10B981]" aria-hidden="true" />
          </div>
          <p
            data-testid="fleet-count-metric"
            className="font-mono-tabular mt-2 text-3xl font-extrabold tracking-tight text-white"
          >
            {nominalBuses}/{routes.length}
          </p>
          <p className="mt-1.5 text-xs font-medium text-[#10B981]">
            Nominal · {congestedRoutesCount} traffic-impacted
          </p>
        </div>

        <div className="glass-card rounded-[22px] p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748B] dark:text-slate-400">
              Students Accounted
            </p>
            <span className="font-mono-tabular text-[11px] font-bold text-[#10B981]">
              {accountedPct}%
            </span>
          </div>
          <p className="font-mono-tabular mt-2 text-3xl font-extrabold tracking-tight text-[#111827] dark:text-white">
            {boardedCount}/{students.length}
          </p>
          <p className="mt-1.5 text-xs text-[#64748B] dark:text-slate-400">
            Verified boarding &amp; handover
          </p>
        </div>

        <div className="glass-card rounded-[22px] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748B] dark:text-slate-400">
            Safety Layer Alerts
          </p>
          <p
            data-testid="active-alert-count"
            className={`font-mono-tabular mt-2 text-3xl font-extrabold tracking-tight ${
              activeAlerts.length > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-[#111827] dark:text-white'
            }`}
          >
            {activeAlerts.length}
          </p>
          <p className="mt-1.5 text-xs text-[#64748B] dark:text-slate-400">
            {activeAlerts.length > 0 ? 'Requires coordinator review' : 'All corridors clear'}
          </p>
        </div>

        <div className="glass-card rounded-[22px] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748B] dark:text-slate-400">
            Verified Proofs
          </p>
          <p className="font-mono-tabular mt-2 text-3xl font-extrabold tracking-tight text-[#111827] dark:text-white">
            {auditLog.length}
          </p>
          <p className="mt-1.5 text-xs text-[#64748B] dark:text-slate-400">
            QR, photo &amp; GPS audit trail
          </p>
        </div>
      </div>

      {/* Capsule Sub-Navigation Tabs for Admin Functions */}
      <div
        role="tablist"
        aria-label="School admin sections"
        className="glass-card inline-flex flex-wrap rounded-full p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={adminTab === 'live'}
          onClick={() => setAdminTab('live')}
          className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
            adminTab === 'live'
              ? 'bg-[#111827] text-white shadow-sm dark:bg-white dark:text-[#111827]'
              : 'text-[#64748B] hover:text-[#111827] dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Live Fleet &amp; Exceptions</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={adminTab === 'routes'}
          onClick={() => setAdminTab('routes')}
          className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
            adminTab === 'routes'
              ? 'bg-[#111827] text-white shadow-sm dark:bg-white dark:text-[#111827]'
              : 'text-[#64748B] hover:text-[#111827] dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          <Route className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Manage Routes &amp; Roster ({routes.length})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={adminTab === 'audit'}
          onClick={() => setAdminTab('audit')}
          className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
            adminTab === 'audit'
              ? 'bg-[#111827] text-white shadow-sm dark:bg-white dark:text-[#111827]'
              : 'text-[#64748B] hover:text-[#111827] dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Handover Confirmations ({auditLog.length})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={adminTab === 'analytics'}
          onClick={() => setAdminTab('analytics')}
          className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
            adminTab === 'analytics'
              ? 'bg-[#111827] text-white shadow-sm dark:bg-white dark:text-[#111827]'
              : 'text-[#64748B] hover:text-[#111827] dark:text-slate-400 dark:hover:text-white'
          }`}
        >
          <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Transport Analytics</span>
        </button>
      </div>

      {/* Active Safety Layer Exceptions Banner (Always visible across tabs when unresolved!) */}
      {activeAlerts.length > 0 && (
        <section
          aria-label="Active safety layer exceptions"
          className="rounded-[24px] border border-red-200/90 bg-red-50/80 p-5 shadow-sm backdrop-blur-xl dark:border-red-900/60 dark:bg-red-950/40"
        >
          <div className="flex items-center gap-2 text-sm font-bold text-red-900 dark:text-red-200">
            <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden="true" />
            <span>Safety Layer Exceptions Requiring Attention ({activeAlerts.length})</span>
          </div>
          <div className="mt-3 divide-y divide-red-200/70 dark:divide-red-900/50">
            {activeAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex flex-col gap-3 py-3 first:pt-1 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-red-800 dark:text-red-300">
                      {alert.title}
                    </span>
                    <span aria-hidden="true" className="text-red-400">·</span>
                    <span className="font-mono-tabular text-red-700/80 dark:text-red-300/80">
                      {alert.timestamp}
                    </span>
                    <span aria-hidden="true" className="text-red-400">·</span>
                    <span className="text-red-700/80 dark:text-red-300/80">
                      {alert.affectedStudentCount} students affected
                    </span>
                  </div>
                  <p className="text-xs text-[#374151] dark:text-slate-300">{alert.detail}</p>
                </div>

                <button
                  type="button"
                  onClick={() => onResolveAlertAndBroadcast(alert.id)}
                  className="btn-spring btn-obsidian gleam-sweep inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold whitespace-nowrap"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Acknowledge &amp; Notify Parents</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TAB 1: LIVE FLEET & SITUATIONAL AWARENESS */}
      {adminTab === 'live' && (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <SyntheticRouteMap
                mode="school"
                routes={routes}
                telemetry={telemetry}
                shift={shift}
                selectedRouteId={selectedRouteId === 'all' ? undefined : selectedRouteId}
                onSelectRoute={(id) =>
                  setSelectedRouteId((prev) => (prev === id ? 'all' : id))
                }
              />
            </div>

            {/* Right 4 cols: Fleet Overview with Traffic & Driver Status + Safety Triggers */}
            <div className="space-y-6 lg:col-span-4">
              <section
                aria-label="Fleet status list"
                className="glass-card rounded-[24px] p-5"
              >
                <div className="flex items-center justify-between border-b border-gray-200/70 pb-3 dark:border-white/10">
                  <h2 className="text-sm font-bold text-[#111827] dark:text-white">
                    Fleet Vehicles &amp; Traffic
                  </h2>
                  {selectedRouteId !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setSelectedRouteId('all')}
                      className="text-xs font-semibold text-[#111827] underline decoration-[#9CA3AF] underline-offset-4 hover:decoration-[#111827] dark:text-white"
                    >
                      Show all buses
                    </button>
                  )}
                </div>

                <div className="mt-3 space-y-2.5">
                  {routes.map((route) => {
                    const v = telemetry[route.id];
                    const stateInfo = v
                      ? formatVehicleState(v.state)
                      : { label: 'Offline', cls: 'text-[#64748B]' };
                    const isSelected = selectedRouteId === route.id;
                    const routeStudents = students.filter((s) => s.routeId === route.id);
                    const routeBoarded = routeStudents.filter(
                      (s) =>
                        s.boardingStatus === 'boarded' ||
                        s.boardingStatus === 'dropped_off'
                    ).length;

                    return (
                      <RouteDefinitionCard
                        key={route.id}
                        compact
                        route={route}
                        assignedStudentCount={routeStudents.length}
                        boardedStudentCount={routeBoarded}
                        speedKmh={v?.speedKmh}
                        etaToNextStopMin={v?.etaToNextStopMin}
                        stateLabel={
                          v && v.state === 'delayed'
                            ? `${stateInfo.label} (+${v.delayMinutes}m)`
                            : stateInfo.label
                        }
                        stateClassName={stateInfo.cls}
                        gpsLabel={v ? formatGpsCoords(v.gpsCoords) : '—'}
                        isSelected={isSelected}
                        onSelect={() =>
                          setSelectedRouteId((prev) =>
                            prev === route.id ? 'all' : route.id
                          )
                        }
                        onTrafficChange={(trafficLevel) =>
                          onUpdateRoute(route.id, { trafficLevel })
                        }
                      />
                    );
                  })}
                </div>
              </section>

              {/* Safety Layer Interactive Exception Triggers */}
              <section
                aria-label="Safety layer scenario simulator"
                className="glass-card rounded-[24px] p-5"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <h2 className="text-sm font-bold text-[#111827] dark:text-white">
                    Test Safety Layer Exceptions
                  </h2>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[#64748B] dark:text-slate-400">
                  Simulate irregularities on{' '}
                  <span className="font-semibold text-[#111827] dark:text-white">
                    {routes.find((r) => r.id === targetRouteForTriggers)?.vehicleLabel ??
                      'Bus 04'}
                  </span>{' '}
                  to test coordinator alerts and parent broadcasts.
                </p>

                <div className="mt-3.5 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      onTriggerException('extended_delay', targetRouteForTriggers)
                    }
                    className="btn-spring glass-subcard min-h-[42px] rounded-2xl px-3.5 py-2 text-left text-xs font-semibold text-[#111827] transition-all hover:border-[#111827] hover:bg-white dark:text-white dark:hover:border-white/40 dark:hover:bg-white/10"
                  >
                    Extended Delay
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onTriggerException('route_deviation', targetRouteForTriggers)
                    }
                    className="btn-spring glass-subcard min-h-[42px] rounded-2xl px-3.5 py-2 text-left text-xs font-semibold text-[#111827] transition-all hover:border-[#111827] hover:bg-white dark:text-white dark:hover:border-white/40 dark:hover:bg-white/10"
                  >
                    Route Deviation
                  </button>
                  <button
                    type="button"
                    onClick={() => onTriggerException('gps_loss', targetRouteForTriggers)}
                    className="btn-spring glass-subcard min-h-[42px] rounded-2xl px-3.5 py-2 text-left text-xs font-semibold text-[#111827] transition-all hover:border-[#111827] hover:bg-white dark:text-white dark:hover:border-white/40 dark:hover:bg-white/10"
                  >
                    GPS Signal Drop
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onTriggerException('student_not_boarded', targetRouteForTriggers)
                    }
                    className="btn-spring glass-subcard min-h-[42px] rounded-2xl px-3.5 py-2 text-left text-xs font-semibold text-[#111827] transition-all hover:border-[#111827] hover:bg-white dark:text-white dark:hover:border-white/40 dark:hover:bg-white/10"
                  >
                    Missed Boarding
                  </button>
                </div>
              </section>
            </div>
          </div>

          {/* High-Density Student Roster Table */}
          <section
            aria-label="Student transport roster"
            className="glass-card overflow-hidden rounded-[24px]"
          >
            <div className="flex flex-col gap-3 border-b border-gray-200/70 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
              <div>
                <h2 className="text-sm font-bold text-[#111827] dark:text-white">
                  Student Roster &amp; Handover Status
                </h2>
                <p className="mt-0.5 text-xs text-[#64748B] dark:text-slate-400">
                  Showing {filteredStudents.length} of {students.length} enrolled students
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B]"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search student, pass, guardian..."
                    aria-label="Search student or guardian"
                    className="h-9 w-60 rounded-full border border-gray-200 bg-white/85 pl-9 pr-3.5 text-xs text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#111827] focus:bg-white focus:outline-none dark:border-white/15 dark:bg-slate-900/80 dark:text-white"
                  />
                </div>

                <select
                  aria-label="Filter by boarding status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-9 rounded-full border border-gray-200 bg-white/85 px-3.5 text-xs font-medium text-[#111827] focus:border-[#111827] focus:outline-none dark:border-white/15 dark:bg-slate-900/80 dark:text-white"
                >
                  <option value="all">All Statuses</option>
                  <option value="expected">Expected</option>
                  <option value="boarded">Boarded</option>
                  <option value="dropped_off">Dropped Off</option>
                  <option value="not_boarded">Not Present</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-200/70 bg-gray-50/70 text-[11px] uppercase tracking-wider text-[#64748B] dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                    <th className="px-5 py-3 font-semibold">Student &amp; Pass</th>
                    <th className="px-4 py-3 font-semibold">Route</th>
                    <th className="px-4 py-3 font-semibold">Assigned Stop</th>
                    <th className="px-4 py-3 font-semibold">Authorized Guardian</th>
                    <th className="px-4 py-3 font-semibold">Handover Verification</th>
                    <th className="px-5 py-3 text-right font-semibold">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200/60 dark:divide-white/10">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-8 text-center text-xs text-[#64748B] dark:text-slate-400"
                      >
                        No students match the current filter. Clear search or status filter to view all records.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map((student) => {
                      const route = routes.find((r) => r.id === student.routeId);
                      const stop = route?.stops.find((st) => st.id === student.stopId);
                      return (
                        <tr
                          key={student.id}
                          className="transition-colors hover:bg-white/70 dark:hover:bg-white/5"
                        >
                          <td className="px-5 py-3.5 font-semibold text-[#111827] dark:text-white">
                            {student.firstName} {student.lastName}
                            <span className="ml-1.5 font-normal text-[#64748B] dark:text-slate-400">
                              · {student.grade}
                            </span>
                            <span className="font-mono-tabular block text-[11px] font-normal text-[#64748B] dark:text-slate-400">
                              {student.qrCodeId}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 font-medium text-[#374151] dark:text-slate-300">
                            {route?.vehicleLabel} · {route?.code}
                          </td>
                          <td className="px-4 py-3.5 text-[#374151] dark:text-slate-300">
                            {stop?.name ?? '—'}
                          </td>
                          <td className="px-4 py-3.5 text-[#374151] dark:text-slate-300">
                            {student.guardianName}
                          </td>
                          <td className="px-4 py-3.5">
                            {student.boardingStatus === 'boarded' && (
                              <span className="inline-flex items-center gap-1.5 font-semibold text-[#10B981] dark:text-emerald-400">
                                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>
                                  Boarded
                                  {student.handoverProof
                                    ? ` · ${
                                        student.handoverProof.method === 'qr_scan'
                                          ? 'QR'
                                          : 'Checklist'
                                      }${student.handoverProof.hasPhotoProof ? ' + Photo' : ''}`
                                    : ''}
                                </span>
                              </span>
                            )}
                            {student.boardingStatus === 'dropped_off' && (
                              <span className="inline-flex items-center gap-1.5 font-semibold text-[#10B981] dark:text-emerald-400">
                                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>
                                  Handed Over
                                  {student.handoverProof?.hasPhotoProof ? ' · Photo Proof' : ''}
                                </span>
                              </span>
                            )}
                            {student.boardingStatus === 'expected' && (
                              <span className="text-[#64748B] dark:text-slate-400">Expected</span>
                            )}
                            {student.boardingStatus === 'not_boarded' && (
                              <span className="font-semibold text-red-600 dark:text-red-400">
                                Not Present
                              </span>
                            )}
                          </td>
                          <td className="font-mono-tabular px-5 py-3.5 text-right text-[#64748B] dark:text-slate-400">
                            {student.droppedOffAt ?? student.boardedAt ?? '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* TAB 2: ROUTE CREATION, VEHICLE ASSIGNMENT & STUDENT ROSTER MANAGEMENT */}
      {adminTab === 'routes' && (
        <SchoolRouteManager
          routes={routes}
          students={students}
          onCreateRoute={onCreateRoute}
          onUpdateRoute={onUpdateRoute}
          onAddStudent={onAddStudent}
          onReassignStudent={onReassignStudent}
          onRemoveStudent={onRemoveStudent}
        />
      )}

      {/* TAB 3: BOARDING & DROP-OFF CONFIRMATION ACCOUNTABILITY LOG */}
      {adminTab === 'audit' && (
        <section
          aria-label="Boarding and drop-off confirmation audit log"
          className="glass-card overflow-hidden rounded-[24px]"
        >
          <div className="border-b border-gray-200/70 px-5 py-4 dark:border-white/10">
            <h2 className="text-sm font-bold text-[#111827] dark:text-white">
              Safe Handover Confirmation &amp; Audit Trail
            </h2>
            <p className="mt-0.5 text-xs text-[#64748B] dark:text-slate-400">
              Immutable accountability log of QR scans, attendant confirmations, photo timestamps, and GPS coordinates.
            </p>
          </div>

          {auditLog.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-[#64748B] dark:text-slate-400">
              No boarding or drop-off events recorded yet for this shift.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-200/70 bg-gray-50/70 text-[11px] uppercase tracking-wider text-[#64748B] dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                    <th className="px-5 py-3 font-semibold">Time</th>
                    <th className="px-4 py-3 font-semibold">Student</th>
                    <th className="px-4 py-3 font-semibold">Vehicle</th>
                    <th className="px-4 py-3 font-semibold">Event &amp; Method</th>
                    <th className="px-4 py-3 font-semibold">Verified By</th>
                    <th className="px-5 py-3 text-right font-semibold">GPS Stamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200/60 dark:divide-white/10">
                  {auditLog.map((entry) => (
                    <tr
                      key={entry.id}
                      className="transition-colors hover:bg-white/70 dark:hover:bg-white/5"
                    >
                      <td className="font-mono-tabular px-5 py-3.5 text-[#64748B] dark:text-slate-400">
                        {entry.timestamp}
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-[#111827] dark:text-white">
                        {entry.studentName}
                      </td>
                      <td className="px-4 py-3.5 text-[#374151] dark:text-slate-300">
                        {entry.vehicleLabel}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 font-semibold text-[#111827] dark:text-white">
                          {entry.method === 'qr_scan' && (
                            <QrCode className="h-3.5 w-3.5 text-[#111827] dark:text-white" aria-hidden="true" />
                          )}
                          <span>
                            {entry.eventType === 'boarded'
                              ? 'Boarding Confirmed'
                              : entry.eventType === 'dropped_off'
                              ? 'Guardian Drop-Off'
                              : entry.eventType === 'arrived_school'
                              ? 'Campus Arrival'
                              : 'Not Present Flagged'}
                          </span>
                          {entry.hasPhotoProof && (
                            <span className="inline-flex items-center gap-1 text-[#10B981] dark:text-emerald-400">
                              · <Camera className="h-3 w-3" aria-hidden="true" /> Photo
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-[#64748B] dark:text-slate-400">
                          {entry.note}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-[#374151] dark:text-slate-300">
                        {entry.verifiedBy}
                      </td>
                      <td className="font-mono-tabular px-5 py-3.5 text-right text-[#64748B] dark:text-slate-400">
                        {entry.gpsLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 4: HISTORICAL ARRIVAL ACCURACY & ROUTE EFFICIENCY ANALYTICS (RECHARTS) */}
      {adminTab === 'analytics' && (
        <TransportAnalytics
          auditLog={auditLog}
          routes={routes}
          students={students}
          shift={shift}
        />
      )}
    </div>
  );
};
