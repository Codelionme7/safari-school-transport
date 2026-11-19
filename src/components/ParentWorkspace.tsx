import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Bus,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Footprints,
  KeyRound,
  Lock,
  MessageSquare,
  Phone,
  QrCode,
  RefreshCw,
  Send,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  X,
} from 'lucide-react';
import {
  ParentNotification,
  ParentNotificationPrefs,
  RouteDefinition,
  ShiftMode,
  StudentRecord,
  VehicleTelemetry,
} from '../types/safari';
import { buildParentScopedSnapshot } from '../engine/simulation';
import { SyntheticRouteMap } from './SyntheticRouteMap';

interface ParentWorkspaceProps {
  studentId: string;
  students: StudentRecord[];
  routes: RouteDefinition[];
  telemetry: Record<string, VehicleTelemetry>;
  shift: ShiftMode;
  onShiftChange: (shift: ShiftMode) => void;
  notifications: ParentNotification[];
  prefs: ParentNotificationPrefs;
  onUpdatePrefs: (next: ParentNotificationPrefs) => void;
  onMarkNotificationsRead: () => void;
  onOpenAttendantDemo: () => void;
}

type ParentSection = 'live' | 'handover' | 'safety';

const ABSENCE_REASONS = [
  'Sick / Medical',
  'Parent Driving',
  'Club / Late Stay',
  'Family Travel',
] as const;

const SAFETY_CONCERN_CHIPS = [
  'Overspeeding / Driving',
  'Missed Stop / Deviated Path',
  'Unannounced Delay',
  'Seatbelt / Vehicle Issue',
] as const;

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export const ParentWorkspace: React.FC<ParentWorkspaceProps> = ({
  studentId,
  students,
  routes,
  telemetry,
  shift,
  onShiftChange,
  notifications,
  prefs,
  onUpdatePrefs,
  onMarkNotificationsRead,
  onOpenAttendantDemo,
}) => {
  const [section, setSection] = useState<ParentSection>('live');
  const [showPrefs, setShowPrefs] = useState(false);
  const [childReadyAtStop, setChildReadyAtStop] = useState(false);

  // Dynamic Pass Token (Image_9)
  const [dynamicToken, setDynamicToken] = useState('SEC-5454');
  const [tokenSeconds, setTokenSeconds] = useState(29);

  // Safety & Absence local UX state (Image_5 / Image_13)
  const [morningPlan, setMorningPlan] = useState<'attending' | 'absent'>('attending');
  const [afternoonPlan, setAfternoonPlan] = useState<'attending' | 'alternative'>('attending');
  const [absenceReason, setAbsenceReason] = useState<string>('Parent Driving');
  const [attendantNote, setAttendantNote] = useState('');
  const [selectedGuardianKey, setSelectedGuardianKey] = useState<'primary' | 'backup'>('backup');
  const [handoverPin, setHandoverPin] = useState<string[]>(['8', '4', '1', '9']);
  const [pinRolling, setPinRolling] = useState(false);
  const [pinSynced, setPinSynced] = useState(false);
  const [showDelegateModal, setShowDelegateModal] = useState(false);
  const [selectedConcerns, setSelectedConcerns] = useState<string[]>([]);
  const [concernNotes, setConcernNotes] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTokenSeconds((prev) => {
        if (prev <= 1) {
          const nextNum = Math.floor(1000 + Math.random() * 9000);
          setDynamicToken(`SEC-${nextNum}`);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3400);
  };

  const handleRegeneratePin = () => {
    if (pinRolling) return;
    setPinRolling(true);
    let ticks = 0;
    const target = Array.from({ length: 4 }, () => String(Math.floor(Math.random() * 9) + 1));
    const timer = window.setInterval(() => {
      ticks += 1;
      setHandoverPin(Array.from({ length: 4 }, () => String(Math.floor(Math.random() * 10))));
      if (ticks >= 7) {
        window.clearInterval(timer);
        setHandoverPin(target);
        setPinRolling(false);
        setPinSynced(true);
        showToast(`Synced with Bus Tablet · New PIN ${target.join(' ')}`);
      }
    }, 55);
  };

  const scoped = buildParentScopedSnapshot({
    studentId,
    students,
    routes,
    telemetry,
    shift,
  });

  if (!scoped) {
    return (
      <div className="glass-card rounded-[24px] p-8 text-center">
        <p className="text-sm text-[#64748B] dark:text-slate-400">
          No active school transport assignment found for this family account.
        </p>
      </div>
    );
  }

  const {
    student,
    route,
    vehicle,
    eta,
    campusEta,
    handoverSteps,
    hiddenStopCount,
    hiddenBusCount,
  } = scoped;
  const assignedStop = route.stops.find((s) => s.id === student.stopId);
  const campusStop = route.stops.find((s) => s.isSchoolCampus);
  const isBoardedHeadingToSchool =
    shift === 'morning' && student.boardingStatus === 'boarded';
  const unreadCount = notifications.filter((n) => !n.read).length;

  const routeStudents = students.filter((s) => s.routeId === route.id);
  const onboardCount = routeStudents.filter(
    (s) => s.boardingStatus === 'boarded' || s.boardingStatus === 'dropped_off'
  ).length;
  const onboardPercent = routeStudents.length
    ? Math.round((onboardCount / routeStudents.length) * 100)
    : 0;

  const activeEtaEstimate = isBoardedHeadingToSchool && campusEta ? campusEta : eta;
  const activeEtaMins = isBoardedHeadingToSchool
    ? Math.max(1, campusEta?.etaMinutes ?? vehicle.etaToNextStopMin)
    : Math.max(0, eta.etaMinutes);
  const activeDistanceKm = isBoardedHeadingToSchool
    ? campusEta?.distanceKm ?? 0
    : eta.isAtStop
    ? 0
    : eta.distanceKm;

  const trafficDelta = activeEtaEstimate.trafficDeltaMinutes;
  const [windowMin, windowMax] = activeEtaEstimate.weightedBreakdown.etaWindowMin;

  const trafficLabel =
    route.trafficLevel === 'heavy'
      ? `Heavy traffic · +${trafficDelta} min`
      : route.trafficLevel === 'moderate'
      ? `Moderate traffic · +${trafficDelta} min`
      : 'Traffic clear';

  const getPrimaryActionCopy = () => {
    if (vehicle.state === 'gps_degraded') {
      return {
        badge: 'Signal Delayed',
        headline: 'Bus location temporarily delayed',
        subline: `Last confirmed ${vehicle.lastHeartbeatSecAgo}s ago · Conservative estimate ~${Math.max(1, eta.etaMinutes)} min to ${assignedStop?.name}.`,
      };
    }

    if (shift === 'morning') {
      if (student.boardingStatus === 'boarded') {
        if (vehicle.state === 'completed') {
          return {
            badge: 'Arrived',
            headline: `${student.firstName} arrived at Oakridge Academy`,
            subline: `Morning journey completed safely · Boarded at ${student.boardedAt ?? '07:04'}.`,
          };
        }
        const schoolMins = Math.max(1, campusEta?.etaMinutes ?? vehicle.etaToNextStopMin);
        return {
          badge: 'On Board',
          headline: `${student.firstName} is on board · Heading to school`,
          subline: `Confirmed by ${route.attendantName} at ${student.boardedAt ?? '07:04'} · Est. arrival at Oakridge Academy in ~${schoolMins} min · ${trafficLabel}.`,
        };
      }
      if (student.boardingStatus === 'not_boarded') {
        return {
          badge: 'Action Needed',
          headline: `${student.firstName} was not confirmed on ${route.vehicleLabel}`,
          subline: `Flagged by attendant at ${assignedStop?.name}. Contact Oakridge Transport if plans changed.`,
        };
      }
      if (eta.isAtStop) {
        return {
          badge: 'At Stop',
          headline: `${route.vehicleLabel} is at ${assignedStop?.name} now`,
          subline: `Driver ${route.driverName} and Attendant ${route.attendantName} are ready for boarding.`,
        };
      }
      if (eta.hasPassedStop) {
        return {
          badge: 'Stop Passed',
          headline: `${route.vehicleLabel} has passed ${assignedStop?.name}`,
          subline: `Awaiting boarding confirmation or guardian update from school transport.`,
        };
      }
      return {
        badge: vehicle.state === 'delayed' ? `Delayed +${vehicle.delayMinutes}m` : 'Approaching',
        headline: `Step out in ~${eta.etaMinutes} min`,
        subline:
          vehicle.state === 'delayed'
            ? `${route.vehicleLabel} is experiencing a +${vehicle.delayMinutes} min delay · ${eta.distanceKm} km from ${assignedStop?.name}.`
            : `${route.vehicleLabel} is ${eta.distanceKm} km from ${assignedStop?.name} · ${trafficLabel}.`,
      };
    }

    if (student.boardingStatus === 'dropped_off') {
      return {
        badge: 'Handed Over',
        headline: `Safe handover completed for ${student.firstName}`,
        subline: `Dropped off at ${assignedStop?.name} at ${student.droppedOffAt ?? '16:16'} to authorized guardian.`,
      };
    }
    if (eta.isAtStop) {
      return {
        badge: 'At Stop',
        headline: `${route.vehicleLabel} has arrived at ${assignedStop?.name}`,
        subline: `Authorized guardian (${student.guardianName} or ${student.authorizedBackupGuardian}) ready for handover.`,
      };
    }
    return {
      badge: vehicle.state === 'delayed' ? `Delayed +${vehicle.delayMinutes}m` : 'En Route Home',
      headline: `Expect ${student.firstName} in ~${Math.max(1, eta.etaMinutes)} min`,
      subline: `${route.vehicleLabel} departed Oakridge Academy · ${eta.distanceKm} km from ${assignedStop?.name} · ${trafficLabel}.`,
    };
  };

  const hero = getPrimaryActionCopy();
  const progressPct = Math.min(100, Math.max(8, Math.round(vehicle.progress * 100)));

  const delegatedGuardianName =
    selectedGuardianKey === 'primary'
      ? `${student.guardianName} (Primary)`
      : `${student.authorizedBackupGuardian} (Backup Guardian)`;

  return (
    <div className="space-y-5">
      {/* Executive Header Strip + Capsule Section Switcher */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#64748B] dark:text-slate-400">
            Parent Companion · {student.firstName} {student.lastName} · {student.grade} · Pass{' '}
            <span className="font-mono-tabular">{student.qrCodeId}</span>
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#111827] dark:text-white">
            Good {shift === 'morning' ? 'morning' : 'afternoon'},{' '}
            {student.guardianName.split(' ')[0]}
          </h1>
        </div>

        {/* Capsule Controls Row */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Parent Sub-View Pill Switcher (Live Bus / Handover & Pass / Safety & Absence) */}
          <div
            role="tablist"
            aria-label="Parent companion views"
            className="inline-flex rounded-full border border-[#E5E7EB]/90 bg-white/90 p-1 shadow-xs backdrop-blur-md dark:border-white/10 dark:bg-[#111827]/80"
          >
            {(
              [
                { id: 'live', label: 'Live Bus' },
                { id: 'handover', label: 'Handover & Pass' },
                { id: 'safety', label: 'Safety & Absence' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={section === tab.id}
                onClick={() => setSection(tab.id)}
                className={`min-h-[36px] rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                  section === tab.id
                    ? 'bg-[#111827] text-white shadow-sm dark:bg-white dark:text-[#111827]'
                    : 'text-[#64748B] hover:text-[#111827] dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Shift Switcher */}
          <div
            role="group"
            aria-label="Journey shift selection"
            className="inline-flex rounded-full border border-[#E5E7EB]/90 bg-white/90 p-1 shadow-xs backdrop-blur-md dark:border-white/10 dark:bg-[#111827]/80"
          >
            <button
              type="button"
              onClick={() => onShiftChange('morning')}
              className={`min-h-[36px] rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                shift === 'morning'
                  ? 'bg-[#111827] text-white shadow-sm dark:bg-white dark:text-[#111827]'
                  : 'text-[#64748B] hover:text-[#111827] dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Morning Pickup
            </button>
            <button
              type="button"
              onClick={() => onShiftChange('afternoon')}
              className={`min-h-[36px] rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                shift === 'afternoon'
                  ? 'bg-[#111827] text-white shadow-sm dark:bg-white dark:text-[#111827]'
                  : 'text-[#64748B] hover:text-[#111827] dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Afternoon Home
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowPrefs((prev) => !prev)}
            aria-expanded={showPrefs}
            className="btn-spring inline-flex min-h-[40px] items-center gap-2 rounded-full border border-[#E5E7EB]/90 bg-white/90 px-4 py-2 text-xs font-semibold text-[#111827] whitespace-nowrap shadow-xs hover:bg-[#F3F4F6] dark:border-white/10 dark:bg-[#111827]/80 dark:text-white dark:hover:bg-white/10"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Alert Preferences</span>
          </button>
        </div>
      </div>

      {/* Collapsible Alert Preferences Frosted Card */}
      {showPrefs && (
        <section
          aria-label="Parent notification preferences"
          className="glass-card rounded-[22px] p-5"
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-[#111827] dark:text-white">
                Approaching Alert Threshold &amp; Delivery Resilience
              </h2>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                Configure when Safari alerts you to step out and enable SMS fallback for weak mobile data.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-5">
              <div>
                <span className="block text-[11px] font-semibold text-[#64748B] dark:text-slate-400">
                  Notify when bus is within
                </span>
                <div className="mt-1.5 inline-flex rounded-full bg-[#F3F4F6] p-1 dark:bg-white/10">
                  {([3, 5, 8, 10] as const).map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() =>
                        onUpdatePrefs({ ...prefs, approachingMinutes: mins })
                      }
                      className={`min-h-[32px] rounded-full px-3 py-1 text-xs font-semibold tabular-nums whitespace-nowrap transition-all ${
                        prefs.approachingMinutes === mins
                          ? 'bg-[#111827] text-white shadow-xs dark:bg-white dark:text-[#111827]'
                          : 'text-[#64748B] hover:text-[#111827] dark:text-slate-300'
                      }`}
                    >
                      {mins} min
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex min-h-[40px] cursor-pointer items-center gap-2.5 text-xs font-medium text-[#111827] dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={prefs.smsFallbackEnabled}
                  onChange={(e) =>
                    onUpdatePrefs({ ...prefs, smsFallbackEnabled: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-[#CBD5E1] accent-[#111827]"
                />
                <span>SMS fallback on weak signal</span>
              </label>

              <label className="flex min-h-[40px] cursor-pointer items-center gap-2.5 text-xs font-medium text-[#111827] dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={prefs.quietHoursEnabled}
                  onChange={(e) =>
                    onUpdatePrefs({ ...prefs, quietHoursEnabled: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-[#CBD5E1] accent-[#111827]"
                />
                <span>Quiet hours ({prefs.quietHoursRange})</span>
              </label>
            </div>
          </div>
        </section>
      )}

      {/* ===================================================================== */}
      {/* TAB 1: LIVE BUS VIEW (Image_7 Executive Monochrome Layout)            */}
      {/* ===================================================================== */}
      {section === 'live' && (
        <div className="space-y-5">
          {/* Subtle Monochrome Telemetry Sync Bar */}
          <div className="glass-card flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs font-medium text-[#4B5563] dark:text-slate-300">
              <span
                className={`h-2 w-2 rounded-full ${
                  vehicle.gpsSignalStrength === 'lost' ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              />
              <span>
                {vehicle.gpsSignalStrength === 'lost'
                  ? `Signal delayed · Last ping ${vehicle.lastHeartbeatSecAgo}s ago`
                  : `GPS Live · Synced ${vehicle.lastHeartbeatSecAgo}s ago · ${route.vehicleLabel} (${route.plateNumber})`}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-semibold text-[#4B5563] dark:text-slate-300">
              <span className="rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-[#111827] dark:bg-white/10 dark:text-slate-200">
                {prefs.smsFallbackEnabled ? 'SMS Fallback Active' : 'Push Only'}
              </span>
              <span className="rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-[#4B5563] dark:bg-white/10 dark:text-slate-300">
                Alert at {prefs.approachingMinutes}m
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left 7 Cols: Hero ETA Card + Readiness Action + Grayscale Map */}
            <div className="space-y-5 lg:col-span-7">
              {/* Hero ETA & Route Status Card (Image_7) */}
              <section
                aria-label="Current journey status"
                className="glass-card rounded-[24px] p-5 sm:p-6"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold tracking-wider text-[#64748B] uppercase dark:text-slate-400">
                      {route.code} · {route.name}
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-[#111827] dark:text-white">
                      {isBoardedHeadingToSchool
                        ? campusStop?.name ?? 'Oakridge Academy'
                        : assignedStop?.name}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#111827] px-3 py-1 text-xs font-semibold text-white shadow-xs dark:bg-white dark:text-[#111827]">
                    {hero.badge}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono-tabular text-4xl font-extrabold tracking-tight text-[#111827] dark:text-white">
                        {activeEtaMins}
                      </span>
                      <span className="text-lg font-bold text-[#64748B] dark:text-slate-400">
                        mins
                      </span>
                      <span className="text-xs font-medium text-[#64748B] dark:text-slate-400">
                        · {trafficLabel}
                      </span>
                    </div>
                    <h2
                      data-testid="parent-hero-headline"
                      className="mt-1.5 text-lg font-bold tracking-tight text-[#111827] dark:text-white"
                    >
                      {hero.headline}
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-[#64748B] dark:text-slate-400">
                      {hero.subline}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1.5">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-[#F4F5F7] px-3.5 py-1.5 text-xs font-bold text-[#111827] dark:border-white/10 dark:bg-white/10 dark:text-white">
                      <span className="text-[#64748B] dark:text-slate-400">
                        {isBoardedHeadingToSchool ? 'To School:' : 'Distance:'}
                      </span>
                      <span className="font-mono-tabular">{activeDistanceKm} km</span>
                    </div>
                    <span className="font-mono-tabular text-[11px] font-medium text-[#64748B] dark:text-slate-400">
                      {vehicle.speedKmh} km/h · Scheduled{' '}
                      {isBoardedHeadingToSchool
                        ? campusStop?.scheduledMorningTime ?? '07:24'
                        : shift === 'morning'
                        ? assignedStop?.scheduledMorningTime
                        : assignedStop?.scheduledAfternoonTime}
                    </span>
                    {!activeEtaEstimate.isAtStop && !activeEtaEstimate.hasPassedStop && activeEtaMins > 0 && (
                      <span
                        data-testid="parent-weighted-eta-detail"
                        className="font-mono-tabular text-[11px] font-medium text-[#64748B] dark:text-slate-400"
                      >
                        Est. window {windowMin}–{windowMax} min
                        {activeEtaEstimate.weightedBreakdown.intermediateStopCount > 0
                          ? ` · ${activeEtaEstimate.weightedBreakdown.intermediateStopCount} stop${
                              activeEtaEstimate.weightedBreakdown.intermediateStopCount > 1 ? 's' : ''
                            } ahead`
                          : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Clean Executive Progress Track */}
                <div className="mt-5 border-t border-[#E5E7EB]/70 pt-4 dark:border-white/10">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#E5E7EB]/80 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-[#111827] transition-all duration-700 dark:bg-white"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="font-medium text-[#64748B] dark:text-slate-400">
                      Route progress {progressPct}%
                    </span>
                    <span className="font-bold text-[#111827] dark:text-white">
                      {isBoardedHeadingToSchool
                        ? 'Next: Oakridge Academy Gate'
                        : `Assigned Stop: ${assignedStop?.name}`}
                    </span>
                  </div>
                </div>
              </section>

              {/* Leave Home / Readiness Action Prompt + Obsidian CTA (Image_7) */}
              <div className="glass-card flex flex-col gap-3.5 rounded-[24px] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#E5E7EB] bg-[#F3F4F6] text-[#111827] dark:border-white/10 dark:bg-white/10 dark:text-white">
                    <Footprints className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#111827] dark:text-white">
                        {student.boardingStatus === 'boarded'
                          ? `${student.firstName} Safely On Board`
                          : 'Step-Out Readiness'}
                      </span>
                      <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-bold text-[#4B5563] dark:bg-white/10 dark:text-slate-300">
                        {childReadyAtStop ? 'Ready' : 'Optimal'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-[#64748B] dark:text-slate-400">
                      {assignedStop?.name} ({assignedStop?.neighborhood}) · Let Attendant{' '}
                      {route.attendantName.split(' ')[0]} know when you are waiting at the stop.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setChildReadyAtStop((prev) => {
                      const next = !prev;
                      showToast(
                        next
                          ? `${student.firstName} marked ready at ${assignedStop?.name}`
                          : 'Ready-at-stop signal cleared'
                      );
                      return next;
                    });
                  }}
                  className={`btn-spring gleam-sweep inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold whitespace-nowrap transition-all ${
                    childReadyAtStop
                      ? 'border border-[#111827] bg-white text-[#111827] dark:border-white dark:bg-[#111827] dark:text-white'
                      : 'btn-obsidian'
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {childReadyAtStop
                      ? `${student.firstName} Ready at Stop`
                      : `Confirm ${student.firstName} Ready`}
                  </span>
                </button>
              </div>

              {/* Scoped Executive Grayscale Live Map */}
              <SyntheticRouteMap
                mode="parent"
                routes={[route]}
                telemetry={telemetry}
                shift={shift}
                highlightedStopId={student.stopId}
                hiddenStopCount={hiddenStopCount}
                hiddenBusCount={hiddenBusCount}
              />
            </div>

            {/* Right 5 Cols: Bento Fleet/Onboard Cards + Proof Receipt + Crew + Updates */}
            <div className="space-y-5 lg:col-span-5">
              {/* Verified Handover Proof Receipt (Always prominent on Live Bus when confirmed!) */}
              {student.handoverProof &&
                (student.boardingStatus === 'boarded' ||
                  student.boardingStatus === 'dropped_off') && (
                  <section
                    data-testid="parent-handover-proof"
                    aria-label="Verified handover proof receipt"
                    className="glass-card-dark rounded-[24px] p-5 text-white"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                        {student.handoverProof.method === 'qr_scan' ? (
                          <QrCode className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        )}
                        <span>
                          Verified via{' '}
                          {student.handoverProof.method === 'qr_scan'
                            ? 'Student QR Pass'
                            : 'Attendant Checklist'}
                        </span>
                      </span>
                      <span className="font-mono-tabular rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                        {student.handoverProof.timestamp}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-300">
                      Confirmed by <span className="font-semibold text-white">{student.handoverProof.verifiedBy}</span> · Stop GPS{' '}
                      <span className="font-mono-tabular text-white">
                        {student.handoverProof.gpsLabel}
                      </span>
                    </p>
                    {student.handoverProof.hasPhotoProof && (
                      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-slate-200">
                        <Camera className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                        <span>
                          Encrypted doorway photo timestamp proof attached (auto-purged in 30 days)
                        </span>
                      </div>
                    )}
                  </section>
                )}

              {/* 2-Column Executive Bento Row: Fleet Details & Onboard (Image_7) */}
              <div className="grid grid-cols-2 gap-3.5">
                <div className="glass-card flex flex-col justify-between rounded-[22px] p-4">
                  <div className="flex items-center justify-between text-[#64748B] dark:text-slate-400">
                    <span className="text-[10px] font-bold tracking-wider uppercase">
                      Fleet Details
                    </span>
                    <Bus className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="mt-3">
                    <p className="truncate text-[15px] font-extrabold text-[#111827] dark:text-white">
                      {route.vehicleLabel}
                    </p>
                    <p className="font-mono-tabular mt-0.5 text-xs text-[#64748B] dark:text-slate-400">
                      {route.plateNumber}
                    </p>
                  </div>
                  <div className="mt-3.5 border-t border-[#E5E7EB]/70 pt-2.5 text-xs font-semibold text-[#4B5563] dark:border-white/10 dark:text-slate-300">
                    {vehicle.speedKmh} km/h · {route.hardwareTrackerId}
                  </div>
                </div>

                <div className="glass-card flex flex-col justify-between rounded-[22px] p-4">
                  <div className="flex items-center justify-between text-[#64748B] dark:text-slate-400">
                    <span className="text-[10px] font-bold tracking-wider uppercase">
                      Onboard
                    </span>
                    <UserCheck className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="mt-3">
                    <div className="flex items-baseline gap-1">
                      <span className="font-mono-tabular text-2xl font-extrabold text-[#111827] dark:text-white">
                        {onboardCount}
                      </span>
                      <span className="font-mono-tabular text-xs font-bold text-[#64748B] dark:text-slate-400">
                        / {routeStudents.length}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-[#64748B] dark:text-slate-400">
                      Pupils confirmed
                    </p>
                  </div>
                  <div className="mt-3.5 border-t border-[#E5E7EB]/70 pt-2.5 dark:border-white/10">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#E5E7EB]/80 dark:bg-white/10">
                      <div
                        className="h-full rounded-full bg-[#111827] transition-all duration-500 dark:bg-white"
                        style={{ width: `${onboardPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Route Guardians Card (Image_7) */}
              <section
                aria-label="Assigned route guardians"
                className="glass-card rounded-[24px] p-5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-wider text-[#64748B] uppercase dark:text-slate-400">
                    Route Guardians
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-[10px] font-semibold text-[#111827] dark:bg-white/10 dark:text-slate-200">
                    <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                    Vetted Staff
                  </span>
                </div>

                <div className="mt-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#111827] text-xs font-bold text-white dark:bg-white dark:text-[#111827]">
                        {getInitials(route.driverName)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#111827] dark:text-white">
                          {route.driverName}
                        </p>
                        <p className="text-xs text-[#64748B] dark:text-slate-400">
                          Assigned Driver · Hands-Free HUD
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSection('safety')}
                      aria-label="Contact transport desk for driver inquiry"
                      className="btn-spring flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F3F4F6] text-[#111827] hover:bg-[#E5E7EB] dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                    >
                      <Phone className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="h-px w-full bg-[#E5E7EB]/70 dark:bg-white/10" />

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-xs font-bold text-[#111827] dark:border-white/15 dark:bg-white/10 dark:text-white">
                        {getInitials(route.attendantName)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#111827] dark:text-white">
                          {route.attendantName}
                        </p>
                        <p className="text-xs text-[#64748B] dark:text-slate-400">
                          Bus Attendant · Handover Custodian
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onOpenAttendantDemo}
                      className="btn-spring rounded-full bg-[#111827] px-3 py-1.5 text-[11px] font-semibold text-white whitespace-nowrap hover:bg-black dark:bg-white dark:text-[#111827]"
                    >
                      Attendant View
                    </button>
                  </div>
                </div>
              </section>

              {/* Calm Journey Updates Feed */}
              <section
                aria-label="Journey notifications"
                className="glass-card rounded-[24px] p-5"
              >
                <div className="flex items-center justify-between gap-2 border-b border-[#E5E7EB]/70 pb-3 dark:border-white/10">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-[#111827] dark:text-white" aria-hidden="true" />
                    <h3 className="text-sm font-bold text-[#111827] dark:text-white">
                      Journey Updates
                    </h3>
                    {unreadCount > 0 && (
                      <span className="rounded-full bg-[#111827] px-2 py-0.5 text-[10px] font-bold text-white tabular-nums dark:bg-white dark:text-[#111827]">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={onMarkNotificationsRead}
                      className="text-xs font-semibold text-[#64748B] hover:text-[#111827] dark:text-slate-400 dark:hover:text-white"
                    >
                      Mark read
                    </button>
                  )}
                </div>

                {notifications.length === 0 ? (
                  <p className="py-6 text-center text-xs text-[#64748B] dark:text-slate-400">
                    No alerts yet. Safari only notifies you when action is helpful.
                  </p>
                ) : (
                  <ul className="divide-y divide-[#E5E7EB]/60 dark:divide-white/10">
                    {notifications.slice(0, 5).map((item) => (
                      <li key={item.id} className="py-3 first:pt-3 last:pb-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-xs font-bold text-[#111827] dark:text-white">
                            {item.title}
                          </p>
                          <span className="font-mono-tabular shrink-0 text-[11px] text-[#64748B] dark:text-slate-400">
                            {item.timestamp} · {item.channel}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-[#64748B] dark:text-slate-400">
                          {item.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: HANDOVER & DIGITAL PASS (Image_9 Chain of Custody Layout)      */}
      {/* ===================================================================== */}
      {section === 'handover' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left 5 Cols: Student Profile + Digital QR Pass + Authorized Guardians */}
          <div className="space-y-5 lg:col-span-5">
            {/* Student Profile + Telemetry Pulse Bar (Image_9) */}
            <section className="glass-card rounded-[24px] p-5">
              <div className="flex items-center gap-3.5">
                <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#111827] text-base font-extrabold text-white shadow-sm dark:bg-white dark:text-[#111827]">
                  {getInitials(`${student.firstName} ${student.lastName}`)}
                  <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white dark:ring-[#111827]">
                    <Check className="h-3 w-3" aria-hidden="true" />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="truncate text-[17px] font-extrabold tracking-tight text-[#111827] dark:text-white">
                      {student.firstName} {student.lastName}
                    </h2>
                    <span className="shrink-0 rounded-full bg-[#111827] px-2.5 py-0.5 text-[11px] font-semibold text-white dark:bg-white dark:text-[#111827]">
                      {student.boardingStatus === 'boarded'
                        ? `On ${route.vehicleLabel}`
                        : student.boardingStatus === 'dropped_off'
                        ? 'Handed Over'
                        : 'Scheduled'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[#64748B] dark:text-slate-400">
                    {student.grade} · Oakridge Academy
                  </p>
                  <span className="font-mono-tabular mt-1 inline-block rounded-md bg-[#F3F4F6] px-2 py-0.5 text-[11px] font-semibold text-[#111827] dark:bg-white/10 dark:text-slate-200">
                    {student.qrCodeId}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[#E5E7EB]/70 pt-4 dark:border-white/10">
                <div className="glass-subcard rounded-2xl p-2.5 text-center">
                  <p className="text-[11px] font-medium text-[#64748B] dark:text-slate-400">Vehicle</p>
                  <p className="font-mono-tabular mt-0.5 text-xs font-bold text-[#111827] dark:text-white">
                    {route.plateNumber}
                  </p>
                </div>
                <div className="glass-subcard rounded-2xl p-2.5 text-center">
                  <p className="text-[11px] font-medium text-[#64748B] dark:text-slate-400">Speed</p>
                  <p className="font-mono-tabular mt-0.5 text-xs font-bold text-[#111827] dark:text-white">
                    {vehicle.speedKmh} km/h
                  </p>
                </div>
                <div className="glass-subcard rounded-2xl p-2.5 text-center">
                  <p className="text-[11px] font-medium text-[#64748B] dark:text-slate-400">ETA</p>
                  <p className="font-mono-tabular mt-0.5 text-xs font-bold text-[#111827] dark:text-white">
                    {activeEtaMins} min
                  </p>
                </div>
              </div>
            </section>

            {/* Digital Student Pass (Image_9 Monochrome QR Card) */}
            <section
              aria-label="Digital student boarding pass"
              className="glass-card rounded-[24px] p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-[#111827] dark:text-white" aria-hidden="true" />
                  <h3 className="text-sm font-bold text-[#111827] dark:text-white">
                    Digital Student Pass
                  </h3>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-2.5 py-0.5 text-[11px] font-semibold text-[#4B5563] dark:border-white/10 dark:bg-white/10 dark:text-slate-300">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  Offline Encrypted
                </span>
              </div>

              <div className="glass-subcard mt-3.5 flex items-center gap-4 rounded-2xl p-3.5">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white p-2 shadow-xs">
                  <svg className="h-16 w-16 text-[#111827]" fill="currentColor" viewBox="0 0 100 100" aria-hidden="true">
                    <rect fill="none" height="28" rx="4" stroke="currentColor" strokeWidth="6" width="28" x="5" y="5" />
                    <rect height="14" rx="2" width="14" x="12" y="12" />
                    <rect fill="none" height="28" rx="4" stroke="currentColor" strokeWidth="6" width="28" x="67" y="5" />
                    <rect height="14" rx="2" width="14" x="74" y="12" />
                    <rect fill="none" height="28" rx="4" stroke="currentColor" strokeWidth="6" width="28" x="5" y="67" />
                    <rect height="14" rx="2" width="14" x="12" y="74" />
                    <rect height="8" width="8" x="42" y="10" />
                    <rect height="16" width="8" x="42" y="24" />
                    <rect height="8" width="16" x="10" y="42" />
                    <rect height="10" width="10" x="32" y="42" />
                    <rect height="6" width="14" x="48" y="42" />
                    <rect height="12" width="12" x="68" y="42" />
                    <rect height="8" width="8" x="86" y="42" />
                    <rect height="22" width="8" x="42" y="68" />
                    <rect height="8" width="12" x="56" y="62" />
                    <rect height="10" width="16" x="74" y="68" />
                    <rect height="14" width="8" x="56" y="78" />
                    <rect height="8" width="18" x="70" y="84" />
                  </svg>
                </div>

                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-bold tracking-wider text-[#64748B] uppercase dark:text-slate-400">
                    Route Pass · Dynamic Token
                  </span>
                  <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
                    <span className="font-mono-tabular text-base font-extrabold text-[#111827] dark:text-white">
                      {student.qrCodeId}
                    </span>
                    <span className="font-mono-tabular text-xs font-semibold text-[#64748B] dark:text-slate-400">
                      {dynamicToken} ({tokenSeconds}s)
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#4B5563] dark:text-slate-300">
                    {student.handoverProof
                      ? `Verified by ${student.handoverProof.verifiedBy} at ${student.handoverProof.timestamp}`
                      : `Present to ${route.attendantName} at ${assignedStop?.name}`}
                  </p>
                </div>
              </div>
            </section>

            {/* Authorized Guardians List (Image_9) */}
            <section
              aria-label="Authorized handover guardians"
              className="glass-card rounded-[24px] p-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#111827] dark:text-white">
                    Authorized Guardians
                  </h3>
                  <p className="text-xs text-[#64748B] dark:text-slate-400">
                    Registered for stop &amp; gate release
                  </p>
                </div>
                <span className="rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-[11px] font-bold text-[#111827] dark:bg-white/10 dark:text-slate-200">
                  2 Active
                </span>
              </div>

              <div className="mt-3.5 space-y-2.5">
                <div className="glass-subcard flex items-center justify-between rounded-2xl p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#111827] text-xs font-bold text-white dark:bg-white dark:text-[#111827]">
                      {getInitials(student.guardianName)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-xs font-bold text-[#111827] dark:text-white">
                          {student.guardianName}
                        </p>
                        <span className="rounded-full bg-[#111827] px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-white dark:text-[#111827]">
                          Primary
                        </span>
                      </div>
                      <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                        Verified Family Account
                      </p>
                    </div>
                  </div>
                  <ShieldCheck className="h-4 w-4 shrink-0 text-[#111827] dark:text-emerald-400" aria-hidden="true" />
                </div>

                <div className="glass-subcard flex items-center justify-between rounded-2xl p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-xs font-bold text-[#111827] dark:border-white/15 dark:bg-white/10 dark:text-white">
                      {getInitials(student.authorizedBackupGuardian)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-xs font-bold text-[#111827] dark:text-white">
                          {student.authorizedBackupGuardian}
                        </p>
                        <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-semibold text-[#4B5563] dark:bg-white/10 dark:text-slate-300">
                          Backup PIN
                        </span>
                      </div>
                      <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                        Single-use PIN Authorization
                      </p>
                    </div>
                  </div>
                  <KeyRound className="h-4 w-4 shrink-0 text-[#64748B] dark:text-slate-400" aria-hidden="true" />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSection('safety')}
                className="btn-spring btn-obsidian gleam-sweep mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold"
              >
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                <span>Manage Guardians &amp; Delegate PIN</span>
              </button>
            </section>
          </div>

          {/* Right 7 Cols: Safe Handover Chain of Custody Vertical Stepper (Image_9) */}
          <div className="space-y-5 lg:col-span-7">
            <section
              aria-label="Safe Handover timeline"
              className="glass-card rounded-[24px] p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB]/70 pb-4 dark:border-white/10">
                <div>
                  <h3 className="text-base font-extrabold tracking-tight text-[#111827] dark:text-white">
                    The Safe Handover Chain of Custody
                  </h3>
                  <p className="mt-0.5 text-xs text-[#64748B] dark:text-slate-400">
                    Continuous verified transitions for {student.firstName}’s {shift} journey
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenAttendantDemo}
                  className="btn-spring rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-3.5 py-1.5 text-xs font-semibold text-[#111827] whitespace-nowrap hover:bg-[#E5E7EB] dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                >
                  Open Attendant View
                </button>
              </div>

              <ol className="mt-5 space-y-3.5">
                {handoverSteps.map((step, idx) => {
                  const isLast = idx === handoverSteps.length - 1;
                  return (
                    <li key={step.id} className="relative flex items-start gap-3.5">
                      <div className="flex flex-col items-center self-stretch">
                        <div
                          className={`z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            step.status === 'completed'
                              ? 'bg-[#111827] text-white dark:bg-white dark:text-[#111827]'
                              : step.status === 'active'
                              ? 'bg-[#111827] text-white ring-4 ring-[#E5E7EB] dark:bg-white dark:text-[#111827] dark:ring-white/20'
                              : step.status === 'attention'
                              ? 'bg-red-600 text-white'
                              : 'bg-[#E5E7EB] text-[#64748B] dark:bg-white/10 dark:text-slate-400'
                          }`}
                        >
                          {step.status === 'completed' ? (
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : step.status === 'attention' ? (
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : step.status === 'active' ? (
                            <Bus className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                        </div>
                        {!isLast && (
                          <div
                            className={`my-1 w-[1.5px] flex-1 ${
                              step.status === 'completed'
                                ? 'bg-[#111827]/40 dark:bg-white/30'
                                : 'bg-[#E5E7EB] dark:bg-white/10'
                            }`}
                          />
                        )}
                      </div>

                      <div
                        className={`min-w-0 flex-1 rounded-2xl p-3.5 transition-all ${
                          step.status === 'active'
                            ? 'border-2 border-[#111827] bg-white shadow-sm dark:border-white dark:bg-[#111827]'
                            : step.status === 'attention'
                            ? 'border border-red-300 bg-red-50/70 dark:border-red-900 dark:bg-red-950/30'
                            : 'glass-subcard'
                        } ${step.status === 'upcoming' ? 'opacity-75' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <p className="text-[13px] font-bold text-[#111827] dark:text-white">
                              {idx + 1}. {step.label}
                            </p>
                            {step.status === 'active' && (
                              <span className="rounded-full bg-[#111827] px-2 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase dark:bg-white dark:text-[#111827]">
                                Live
                              </span>
                            )}
                          </div>
                          <span className="font-mono-tabular shrink-0 text-[11px] font-medium text-[#64748B] dark:text-slate-400">
                            {step.timestamp ?? 'Pending'}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] font-medium text-[#64748B] dark:text-slate-400">
                          {step.actor}
                        </p>
                        <p className="mt-1.5 text-xs leading-relaxed text-[#4B5563] dark:text-slate-300">
                          {step.detail}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {/* Verified Handover Proof Receipt (Also shown here on Handover & Pass) */}
              {student.handoverProof &&
                (student.boardingStatus === 'boarded' ||
                  student.boardingStatus === 'dropped_off') && (
                  <div
                    data-testid="parent-handover-proof"
                    className="glass-card-dark mt-5 rounded-2xl p-4 text-white"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-bold text-emerald-400">
                        {student.handoverProof.method === 'qr_scan' ? (
                          <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        <span>
                          Verified via{' '}
                          {student.handoverProof.method === 'qr_scan'
                            ? 'Student QR Pass'
                            : 'Attendant Checklist'}
                        </span>
                      </span>
                      <span className="font-mono-tabular text-slate-300">
                        {student.handoverProof.timestamp}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-300">
                      Confirmed by {student.handoverProof.verifiedBy} · Stop GPS{' '}
                      <span className="font-mono-tabular text-white">
                        {student.handoverProof.gpsLabel}
                      </span>
                    </p>
                    {student.handoverProof.hasPhotoProof && (
                      <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                        <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          Encrypted doorway photo timestamp proof attached (auto-purged in 30 days)
                        </span>
                      </p>
                    )}
                  </div>
                )}
            </section>

            {/* Privacy Compliance Footer Card (Image_9) */}
            <div className="glass-card flex items-start gap-3 rounded-[22px] p-4">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#111827] dark:text-emerald-400" aria-hidden="true" />
              <div>
                <p className="text-xs font-bold text-[#111827] dark:text-white">
                  Visibility Without Exposure · Child Data Minimization
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[#64748B] dark:text-slate-400">
                  Your parent view is scoped exclusively to {student.firstName}’s bus and stop.
                  {hiddenStopCount} other stops and {hiddenBusCount} unrelated vehicles are never
                  transmitted to your device; all proof records auto-purge after 30 days.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: SAFETY, ABSENCE & GUARDIAN PIN (Image_5 / Image_13)            */}
      {/* ===================================================================== */}
      {section === 'safety' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left 6 Cols: Daily Transport Toggle + Absence Reason */}
          <div className="space-y-5 lg:col-span-6">
            <section className="glass-card space-y-4 rounded-[24px] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-extrabold tracking-tight text-[#111827] dark:text-white">
                    Daily Transport Toggle
                  </h2>
                  <p className="text-xs text-[#64748B] dark:text-slate-400">
                    Will {student.firstName} use school transit today?
                  </p>
                </div>
                <Bus className="h-5 w-5 text-[#64748B] dark:text-slate-400" aria-hidden="true" />
              </div>

              {/* Morning Pickup Toggle */}
              <div className="glass-subcard space-y-2.5 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#111827] dark:text-white">
                    Morning Pickup · {assignedStop?.name}
                  </span>
                  <span className="rounded-full border border-[#E5E7EB] bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#111827] dark:border-white/15 dark:bg-white/10 dark:text-white">
                    {morningPlan === 'attending' ? 'Attending' : 'Marked Absent'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 rounded-full bg-[#E5E7EB]/70 p-1 dark:bg-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setMorningPlan('attending');
                      showToast('Morning transit set to Attending');
                    }}
                    className={`min-h-[38px] rounded-full text-xs font-semibold transition-all ${
                      morningPlan === 'attending'
                        ? 'bg-[#111827] text-white shadow-xs dark:bg-white dark:text-[#111827]'
                        : 'text-[#4B5563] hover:text-[#111827] dark:text-slate-300'
                    }`}
                  >
                    Attending
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMorningPlan('absent');
                      showToast('Morning marked absent — select a reason below');
                    }}
                    className={`min-h-[38px] rounded-full text-xs font-semibold transition-all ${
                      morningPlan === 'absent'
                        ? 'bg-[#111827] text-white shadow-xs dark:bg-white dark:text-[#111827]'
                        : 'text-[#4B5563] hover:text-[#111827] dark:text-slate-300'
                    }`}
                  >
                    Mark Absent
                  </button>
                </div>
              </div>

              {/* Afternoon Drop-Off Toggle */}
              <div className="glass-subcard space-y-2.5 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#111827] dark:text-white">
                    Afternoon Drop-Off · {assignedStop?.scheduledAfternoonTime}
                  </span>
                  <span className="rounded-full border border-[#E5E7EB] bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#111827] dark:border-white/15 dark:bg-white/10 dark:text-white">
                    {afternoonPlan === 'attending' ? 'Standard' : 'Alt Handover'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 rounded-full bg-[#E5E7EB]/70 p-1 dark:bg-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setAfternoonPlan('attending');
                      showToast('Afternoon standard route restored');
                    }}
                    className={`min-h-[38px] rounded-full text-xs font-semibold transition-all ${
                      afternoonPlan === 'attending'
                        ? 'bg-[#111827] text-white shadow-xs dark:bg-white dark:text-[#111827]'
                        : 'text-[#4B5563] hover:text-[#111827] dark:text-slate-300'
                    }`}
                  >
                    Attending
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAfternoonPlan('alternative');
                      showToast('Alt Handover enabled · Share Single-Use PIN with guardian');
                    }}
                    className={`min-h-[38px] rounded-full text-xs font-semibold transition-all ${
                      afternoonPlan === 'alternative'
                        ? 'bg-[#111827] text-white shadow-xs dark:bg-white dark:text-[#111827]'
                        : 'text-[#4B5563] hover:text-[#111827] dark:text-slate-300'
                    }`}
                  >
                    Alt Handover
                  </button>
                </div>
              </div>
            </section>

            {/* Absence Reason Card (Image_5) */}
            <section className="glass-card space-y-4 rounded-[24px] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold tracking-tight text-[#111827] dark:text-white">
                    Absence Reason
                  </h3>
                  <p className="text-xs text-[#64748B] dark:text-slate-400">
                    Notify Oakridge Dispatch &amp; Attendant {route.attendantName}
                  </p>
                </div>
                <span className="rounded-full bg-[#F3F4F6] px-2.5 py-1 text-[11px] font-semibold text-[#4B5563] dark:bg-white/10 dark:text-slate-300">
                  Roster Sync
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {ABSENCE_REASONS.map((reason) => {
                  const active = absenceReason === reason;
                  return (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setAbsenceReason(reason)}
                      className={`btn-spring min-h-[44px] rounded-2xl border px-3.5 text-left text-xs font-semibold transition-all ${
                        active
                          ? 'border-[#111827] bg-[#111827] text-white shadow-sm dark:border-white dark:bg-white dark:text-[#111827]'
                          : 'border-[#E5E7EB] bg-[#F9FAFB] text-[#4B5563] hover:border-[#111827] dark:border-white/10 dark:bg-white/5 dark:text-slate-300'
                      }`}
                    >
                      {reason}
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4B5563] dark:text-slate-300">
                  Note for Attendant {route.attendantName}
                  <input
                    type="text"
                    value={attendantNote}
                    onChange={(e) => setAttendantNote(e.target.value)}
                    placeholder="e.g. Dropping off at 8:15 AM gate entrance"
                    className="mt-1.5 h-11 w-full rounded-2xl border border-[#E5E7EB] bg-white/80 px-3.5 text-xs text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#111827] focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-white"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={() =>
                  showToast(
                    `Transit plan updated (${absenceReason}) · ${route.attendantName} notified`
                  )
                }
                className="btn-spring btn-obsidian gleam-sweep flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full text-xs font-bold"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                <span>Confirm Transit Update</span>
              </button>
            </section>
          </div>

          {/* Right 6 Cols: Alternative Guardian Handover PIN + Incident Escalation */}
          <div className="space-y-5 lg:col-span-6">
            {/* Alternative Guardian Handover PIN (Image_5) */}
            <section className="glass-card space-y-4 rounded-[24px] p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-[#111827] dark:text-white" aria-hidden="true" />
                  <h2 className="text-base font-extrabold tracking-tight text-[#111827] dark:text-white">
                    Alternative Guardian Handover
                  </h2>
                </div>
                <span className="rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-2.5 py-0.5 text-[11px] font-semibold text-[#111827] dark:border-white/15 dark:bg-white/10 dark:text-white">
                  Secure PIN
                </span>
              </div>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                Authorized adult must show photo ID and provide this 4-digit code to {route.attendantName} at handover.
              </p>

              <div className="space-y-2">
                <label className="glass-subcard flex cursor-pointer items-center justify-between rounded-2xl p-3 transition-colors hover:border-[#111827] dark:hover:border-white/30">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#111827] text-xs font-bold text-white dark:bg-white dark:text-[#111827]">
                      {getInitials(student.authorizedBackupGuardian)}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#111827] dark:text-white">
                        {student.authorizedBackupGuardian}
                      </p>
                      <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                        Backup Guardian · ID Verified
                      </p>
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="guardian_choice"
                    checked={selectedGuardianKey === 'backup'}
                    onChange={() => setSelectedGuardianKey('backup')}
                    className="h-4 w-4 accent-[#111827]"
                  />
                </label>

                <label className="glass-subcard flex cursor-pointer items-center justify-between rounded-2xl p-3 transition-colors hover:border-[#111827] dark:hover:border-white/30">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E5E7EB] bg-white text-xs font-bold text-[#111827] dark:border-white/15 dark:bg-white/10 dark:text-white">
                      {getInitials(student.guardianName)}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#111827] dark:text-white">
                        {student.guardianName}
                      </p>
                      <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                        Primary Guardian · Biometric Enrolled
                      </p>
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="guardian_choice"
                    checked={selectedGuardianKey === 'primary'}
                    onChange={() => setSelectedGuardianKey('primary')}
                    className="h-4 w-4 accent-[#111827]"
                  />
                </label>
              </div>

              {/* Single-Use Monospace PIN Display Box */}
              <div
                className={`glass-subcard flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 transition-all ${
                  pinRolling ? 'ring-2 ring-emerald-500/40' : ''
                }`}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold tracking-wider text-[#64748B] uppercase dark:text-slate-400">
                      Single-Use PIN
                    </span>
                    {pinSynced && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
                        Synced with Bus Tablet
                      </span>
                    )}
                  </div>
                  <div
                    data-testid="handover-pin-value"
                    className="font-mono-tabular mt-1 text-2xl font-extrabold tracking-[0.26em] text-[#111827] dark:text-white"
                  >
                    {handoverPin.join(' ')}
                  </div>
                  <p className="mt-0.5 text-[11px] text-[#64748B] dark:text-slate-400">
                    Valid today until 17:30 · Single-use release code
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRegeneratePin}
                  className="btn-spring btn-obsidian inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-semibold"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${pinRolling ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span>Regenerate</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowDelegateModal(true)}
                className="btn-spring btn-obsidian gleam-sweep flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full text-xs font-bold"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                <span>Manage Guardians &amp; Delegate PIN</span>
              </button>
            </section>

            {/* Incident & Safety Escalation Card (Image_5) */}
            <section className="glass-card space-y-4 rounded-[24px] p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-[#111827] dark:text-white" aria-hidden="true" />
                  <h3 className="text-base font-extrabold tracking-tight text-[#111827] dark:text-white">
                    Incident &amp; Safety Escalation
                  </h3>
                </div>
                <span className="rounded-full border border-[#E5E7EB] bg-[#F3F4F6] px-2.5 py-0.5 text-[11px] font-semibold text-[#4B5563] dark:border-white/15 dark:bg-white/10 dark:text-slate-300">
                  Audit Tracked
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {SAFETY_CONCERN_CHIPS.map((chip) => {
                  const selected = selectedConcerns.includes(chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() =>
                        setSelectedConcerns((prev) =>
                          prev.includes(chip)
                            ? prev.filter((c) => c !== chip)
                            : [...prev, chip]
                        )
                      }
                      className={`btn-spring rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                        selected
                          ? 'bg-[#111827] text-white dark:bg-white dark:text-[#111827]'
                          : 'bg-[#F3F4F6] text-[#374151] hover:bg-[#E5E7EB] dark:bg-white/10 dark:text-slate-300'
                      }`}
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>

              <textarea
                rows={2}
                value={concernNotes}
                onChange={(e) => setConcernNotes(e.target.value)}
                aria-label="Safety escalation details"
                placeholder="Provide specifics (e.g. Bus bypassed junction, delay alert)..."
                className="w-full rounded-2xl border border-[#E5E7EB] bg-white/80 p-3.5 text-xs text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#111827] focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-white"
              />

              <button
                type="button"
                onClick={() => {
                  showToast('Safety concern logged to Oakridge Transport Audit Trail');
                  setConcernNotes('');
                  setSelectedConcerns([]);
                }}
                className="btn-spring btn-obsidian flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full text-xs font-bold"
              >
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                <span>Submit Safety Concern</span>
              </button>
            </section>
          </div>
        </div>
      )}

      {/* Confirm PIN Delegation Modal (Image_5) */}
      {showDelegateModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm PIN Delegation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        >
          <div className="glass-card w-full max-w-sm space-y-4 rounded-[28px] bg-white/95 p-6 shadow-2xl dark:bg-[#111827]/95">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-extrabold text-[#111827] dark:text-white">
                  Confirm PIN Delegation
                </h3>
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  Secure Dispatch Authorization
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDelegateModal(false)}
                aria-label="Close delegation modal"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#64748B] hover:bg-[#F3F4F6] dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="glass-subcard space-y-2 rounded-2xl p-4 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#64748B] dark:text-slate-400">Delegated Guardian</span>
                <span className="font-bold text-[#111827] dark:text-white">
                  {delegatedGuardianName}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-[#E5E7EB]/70 pt-2 dark:border-white/10">
                <span className="text-[#64748B] dark:text-slate-400">Active Passcode</span>
                <span className="font-mono-tabular text-base font-extrabold tracking-widest text-[#111827] dark:text-white">
                  {handoverPin.join(' ')}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setShowDelegateModal(false)}
                className="min-h-[42px] rounded-full border border-[#E5E7EB] bg-[#F9FAFB] text-xs font-semibold text-[#111827] hover:bg-[#F3F4F6] dark:border-white/15 dark:bg-white/5 dark:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDelegateModal(false);
                  setPinSynced(true);
                  showToast(
                    `PIN ${handoverPin.join('')} securely delegated to ${delegatedGuardianName}`
                  );
                }}
                className="btn-spring btn-obsidian min-h-[42px] rounded-full text-xs font-bold"
              >
                Send &amp; Delegate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tactile Monochrome Toast */}
      {toastMessage && (
        <div
          role="status"
          className="glass-card-dark fixed bottom-20 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center justify-between gap-3 rounded-2xl px-4 py-3 text-white shadow-2xl lg:bottom-6"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
            <span className="truncate text-xs font-semibold">{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            aria-label="Dismiss notification"
            className="text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
};
