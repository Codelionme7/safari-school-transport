import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Compass,
  HeartHandshake,
  LayoutDashboard,
  Moon,
  ShieldCheck,
  Sun,
  Users,
} from 'lucide-react';
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
  WorkspaceTab,
} from './types/safari';
import {
  INITIAL_AUDIT_LOG,
  INITIAL_NOTIFICATION_PREFS,
  INITIAL_PARENT_NOTIFICATIONS,
  INITIAL_STUDENTS,
  PARENT_DEMO_PROFILE,
  SYNTHETIC_ROUTES,
} from './data/syntheticData';
import {
  createRouteFromInput,
  evaluateDestinationArrivalNotification,
  evaluateParentApproachingNotification,
  formatGpsCoords,
  triggerSafetyException,
} from './engine/simulation';
import { safariTelemetryService } from './services/telemetry';
import { ParentWorkspace } from './components/ParentWorkspace';
import { SchoolDashboard } from './components/SchoolDashboard';
import { DriverAttendantWorkspace } from './components/DriverAttendantWorkspace';
import { ProductionBlueprint } from './components/ProductionBlueprint';

const NAV_ITEMS: Array<{
  id: WorkspaceTab;
  label: string;
  shortLabel: string;
  breadcrumb: string;
  icon: React.FC<{ className?: string }>;
}> = [
  {
    id: 'parent',
    label: 'Parent Companion',
    shortLabel: 'Parent',
    breadcrumb: 'Safari / Parent Companion',
    icon: HeartHandshake,
  },
  {
    id: 'school',
    label: 'School Operations',
    shortLabel: 'School Ops',
    breadcrumb: 'Safari / School Operations',
    icon: LayoutDashboard,
  },
  {
    id: 'driver',
    label: 'Driver & Handover',
    shortLabel: 'Handover',
    breadcrumb: 'Safari / Driver & Handover',
    icon: Users,
  },
  {
    id: 'blueprint',
    label: 'Blueprint & Roadmap',
    shortLabel: 'Blueprint',
    breadcrumb: 'Safari / Production Blueprint',
    icon: Compass,
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('parent');
  const [shift, setShift] = useState<ShiftMode>('morning');
  const [darkMode, setDarkMode] = useState(false);

  const [routes, setRoutes] = useState<RouteDefinition[]>(SYNTHETIC_ROUTES);
  const [students, setStudents] = useState<StudentRecord[]>(INITIAL_STUDENTS);
  const [telemetry, setTelemetry] = useState<Record<string, VehicleTelemetry>>(() =>
    safariTelemetryService.syncRoutes(SYNTHETIC_ROUTES, 'morning', true)
  );
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [auditLog, setAuditLog] = useState<ConfirmationAuditEntry[]>(INITIAL_AUDIT_LOG);
  const [notifications, setNotifications] = useState<ParentNotification[]>(
    INITIAL_PARENT_NOTIFICATIONS
  );
  const [prefs, setPrefs] = useState<ParentNotificationPrefs>(
    INITIAL_NOTIFICATION_PREFS
  );

  const [isSimRunning, setIsSimRunning] = useState(true);
  const [simSpeed, setSimSpeed] = useState<1 | 3 | 8>(1);
  const [simMinuteOffset, setSimMinuteOffset] = useState(0);

  const firedNotificationKeysRef = useRef<Set<string>>(new Set());

  // Initialize telemetry service socket lifecycle & subscribe frontend state to the pub/sub stream
  useEffect(() => {
    const cleanupConnection = safariTelemetryService.initialize();
    const subscription = safariTelemetryService.subscribeToFleet(
      (fleetSnapshot) => {
        setTelemetry(fleetSnapshot);
      },
      { emitCurrentImmediately: true }
    );
    return () => {
      subscription.unsubscribe();
      cleanupConnection();
    };
  }, []);

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  const formatSimClock = useCallback(
    (offsetMinutes: number) => {
      const baseMinutes = shift === 'morning' ? 6 * 60 + 57 : 16 * 60 + 2;
      const total = baseMinutes + Math.floor(offsetMinutes);
      const hh = Math.floor(total / 60) % 24;
      const mm = total % 60;
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    },
    [shift]
  );

  const currentClockLabel = formatSimClock(simMinuteOffset);

  // Switch Morning / Afternoon shift cleanly
  const handleShiftChange = useCallback(
    (nextShift: ShiftMode) => {
      setShift(nextShift);
      setSimMinuteOffset(0);
      firedNotificationKeysRef.current.clear();
      safariTelemetryService.syncRoutes(routes, nextShift, true);
      setAlerts([]);
      setStudents((prev) =>
        prev.map((s) =>
          nextShift === 'afternoon'
            ? {
                ...s,
                boardingStatus: 'boarded',
                boardedAt: '15:55',
                droppedOffAt: undefined,
              }
            : {
                ...s,
                boardingStatus: s.id === 'stu-01' ? 'expected' : s.boardingStatus,
                droppedOffAt: undefined,
              }
        )
      );
      setNotifications([
        {
          id: `notif-shift-${Date.now()}`,
          title:
            nextShift === 'morning'
              ? 'Morning route active'
              : 'Afternoon journey home started',
          body:
            nextShift === 'morning'
              ? 'Bus 04 (North Ridge Loop) is approaching Maple & 4th Crossing on schedule.'
              : 'Bus 04 departed Oakridge Academy. Authorized guardian handover enabled at Maple & 4th Crossing.',
          timestamp: nextShift === 'morning' ? '06:57' : '16:02',
          channel: 'Push',
          category: 'advisory',
          read: false,
        },
      ]);
    },
    [routes]
  );

  const handleResetSimulation = useCallback(() => {
    handleShiftChange(shift);
    setIsSimRunning(true);
  }, [handleShiftChange, shift]);

  // Deterministic live fleet simulation tick published via TelemetryIngestionService pub/sub
  useEffect(() => {
    if (!isSimRunning) return;

    const timer = window.setInterval(() => {
      const deltaProgress = 0.0045 * simSpeed;
      setSimMinuteOffset((m) => m + 0.15 * simSpeed);
      safariTelemetryService.stepActiveJourneys(deltaProgress, 'simulation_engine');
    }, 1200);

    return () => window.clearInterval(timer);
  }, [isSimRunning, simSpeed]);

  // Evaluate geofence approaching & destination arrival alerts whenever telemetry changes
  useEffect(() => {
    const maya = students.find((s) => s.id === PARENT_DEMO_PROFILE.studentId);
    const route = routes.find((r) => r.id === maya?.routeId);
    const vehicle = route ? telemetry[route.id] : undefined;
    if (!maya || !route || !vehicle) return;

    const approaching = evaluateParentApproachingNotification({
      route,
      vehicle,
      student: maya,
      shift,
      prefs,
      firedKeys: firedNotificationKeysRef.current,
      clockLabel: currentClockLabel,
    });

    if (approaching.notification && approaching.eventKey) {
      firedNotificationKeysRef.current.add(approaching.eventKey);
      setNotifications((prev) => [approaching.notification!, ...prev]);
    }

    const arrival = evaluateDestinationArrivalNotification({
      route,
      vehicle,
      student: maya,
      shift,
      firedKeys: firedNotificationKeysRef.current,
      clockLabel: currentClockLabel,
    });

    if (arrival.notification && arrival.eventKey) {
      firedNotificationKeysRef.current.add(arrival.eventKey);
      setNotifications((prev) => [arrival.notification!, ...prev]);
      setAuditLog((prev) => [
        {
          id: `aud-arr-${Date.now()}`,
          studentId: maya.id,
          studentName: `${maya.firstName} ${maya.lastName}`,
          routeId: route.id,
          vehicleLabel: route.vehicleLabel,
          eventType: 'arrived_school',
          method: 'checklist',
          timestamp: currentClockLabel,
          verifiedBy: `${route.vehicleLabel} Automated Geofence`,
          hasPhotoProof: false,
          gpsLabel: formatGpsCoords(vehicle.gpsCoords),
          note: `Reached Oakridge Academy campus; parent notified immediately.`,
        },
        ...prev,
      ]);
    }
  }, [telemetry, students, routes, shift, prefs, currentClockLabel]);

  // Create a brand-new route and immediately start live GPS tracking for it
  const handleCreateRoute = useCallback(
    (input: {
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
    }) => {
      const newRoute = createRouteFromInput(input);
      setRoutes((prev) => {
        const nextRoutes = [...prev, newRoute];
        safariTelemetryService.syncRoutes(nextRoutes, shift, false);
        return nextRoutes;
      });
    },
    [shift]
  );

  // Edit route / reassign vehicle, driver, attendant, or live traffic level
  const handleUpdateRoute = useCallback(
    (
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
    ) => {
      setRoutes((prev) => {
        const updated = prev.map((r) => (r.id === routeId ? { ...r, ...patch } : r));
        // Immediately recalculate vehicle telemetry ETA/speed when traffic changes via pub/sub service
        safariTelemetryService.syncRoutes(updated, shift, false);
        return updated;
      });
    },
    [shift]
  );

  // Add student to route roster with auto-generated QR pass code
  const handleAddStudent = useCallback(
    (input: {
      firstName: string;
      lastName: string;
      grade: string;
      routeId: string;
      stopId: string;
      guardianName: string;
      authorizedBackupGuardian: string;
    }) => {
      const targetRoute = routes.find((r) => r.id === input.routeId);
      const codePrefix = (targetRoute?.code ?? 'SR01').replace('-', '');
      const seq = String(students.length + 1).padStart(2, '0');
      const newStudent: StudentRecord = {
        id: `stu-${Date.now().toString(36)}`,
        qrCodeId: `SAF-${codePrefix}-${seq}`,
        firstName: input.firstName,
        lastName: input.lastName,
        grade: input.grade,
        routeId: input.routeId,
        stopId: input.stopId,
        guardianName: input.guardianName,
        authorizedBackupGuardian: input.authorizedBackupGuardian,
        boardingStatus: 'expected',
      };
      setStudents((prev) => [newStudent, ...prev]);
    },
    [routes, students.length]
  );

  const handleReassignStudent = useCallback(
    (studentId: string, routeId: string, stopId: string) => {
      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, routeId, stopId } : s))
      );
    },
    []
  );

  const handleRemoveStudent = useCallback((studentId: string) => {
    setStudents((prev) => prev.filter((s) => s.id !== studentId));
  }, []);

  // Secure Boarding / Guardian Drop-Off Confirmation synced live to Parent, School & Audit Log
  const handleUpdateStudentBoarding = useCallback(
    (
      studentId: string,
      status: BoardingStatus,
      options?: { method?: VerificationMethod; hasPhotoProof?: boolean }
    ) => {
      const clock = currentClockLabel;
      const targetStudent = students.find((s) => s.id === studentId);
      const route = routes.find((r) => r.id === targetStudent?.routeId);
      const vehicle = route ? telemetry[route.id] : undefined;
      const method: VerificationMethod = options?.method ?? 'checklist';
      const hasPhotoProof = Boolean(options?.hasPhotoProof);
      const gpsLabel = vehicle ? formatGpsCoords(vehicle.gpsCoords) : '-1.2480, 36.8012';
      const verifier = route?.attendantName ?? 'Transport Attendant';

      setStudents((prev) =>
        prev.map((s) => {
          if (s.id !== studentId) return s;
          if (status === 'boarded') {
            return {
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
          }
          if (status === 'dropped_off') {
            return {
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
          }
          if (status === 'not_boarded') {
            return {
              ...s,
              boardingStatus: 'not_boarded',
              boardedAt: undefined,
            };
          }
          return {
            ...s,
            boardingStatus: 'expected',
            boardedAt: undefined,
            droppedOffAt: undefined,
            handoverProof: undefined,
          };
        })
      );

      // Record immutable confirmation audit entry for School Admin Dashboard
      if (targetStudent && route && status !== 'expected') {
        const methodText = method === 'qr_scan' ? 'QR pass scan' : 'attendant checklist';
        setAuditLog((prev) => [
          {
            id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            studentId: targetStudent.id,
            studentName: `${targetStudent.firstName} ${targetStudent.lastName}`,
            routeId: route.id,
            vehicleLabel: route.vehicleLabel,
            eventType: status,
            method,
            timestamp: clock,
            verifiedBy: verifier,
            hasPhotoProof,
            gpsLabel,
            note:
              status === 'not_boarded'
                ? `Marked not present at stop departure by ${verifier}.`
                : `Verified via ${methodText}${
                    hasPhotoProof ? ' with encrypted doorway photo proof' : ''
                  }.`,
          },
          ...prev,
        ]);
      }

      // Immediate Parent Notification when demo child's status changes
      if (targetStudent && targetStudent.id === PARENT_DEMO_PROFILE.studentId && route) {
        const methodLabel = method === 'qr_scan' ? 'QR pass scan' : 'attendant verification';
        const photoNote = hasPhotoProof ? ' Encrypted timestamped photo proof attached.' : '';

        if (status === 'boarded') {
          setNotifications((prev) => [
            {
              id: `notif-board-${Date.now()}`,
              title: `Boarding confirmed · ${targetStudent.firstName}`,
              body: `${targetStudent.firstName} boarded ${route.vehicleLabel} at ${clock} via ${methodLabel} (${verifier}).${photoNote}`,
              timestamp: clock,
              channel: 'Push',
              category: 'handover',
              read: false,
            },
            ...prev,
          ]);
        } else if (status === 'dropped_off') {
          setNotifications((prev) => [
            {
              id: `notif-drop-${Date.now()}`,
              title: `Safe handover completed · ${targetStudent.firstName}`,
              body: `${targetStudent.firstName} handed over safely at ${clock} to authorized guardian via ${methodLabel} (${verifier}).${photoNote}`,
              timestamp: clock,
              channel: 'Push',
              category: 'completed',
              read: false,
            },
            ...prev,
          ]);
        } else if (status === 'not_boarded' && vehicle) {
          const { alert } = triggerSafetyException({
            type: 'student_not_boarded',
            route,
            vehicle,
            affectedStudentCount: 1,
            clockLabel: clock,
          });
          setAlerts((prev) => [alert, ...prev]);
          setNotifications((prev) => [
            {
              id: `notif-absent-${Date.now()}`,
              title: `${targetStudent.firstName} not confirmed at pickup`,
              body: `Attendant ${verifier} marked ${targetStudent.firstName} as not present at stop departure (${clock}).`,
              timestamp: clock,
              channel: prefs.smsFallbackEnabled ? 'SMS Fallback' : 'Push',
              category: 'advisory',
              read: false,
            },
            ...prev,
          ]);
        }
      }
    },
    [currentClockLabel, students, routes, telemetry, prefs.smsFallbackEnabled]
  );

  // Trigger Safety Layer exception from School Dashboard or Driver HUD
  const handleTriggerException = useCallback(
    (
      type: 'extended_delay' | 'route_deviation' | 'gps_loss' | 'student_not_boarded',
      routeId: string
    ) => {
      const route = routes.find((r) => r.id === routeId);
      const vehicle = telemetry[routeId];
      if (!route || !vehicle) return;

      const affectedCount = students.filter((s) => s.routeId === routeId).length;
      const { updatedVehicle, alert } = triggerSafetyException({
        type,
        route,
        vehicle,
        affectedStudentCount: affectedCount,
        clockLabel: currentClockLabel,
      });

      safariTelemetryService.ingestLocationUpdate({
        eventId: `exc-${routeId}-${Date.now()}`,
        routeId,
        hardwareTrackerId: route.hardwareTrackerId,
        timestampMs: Date.now(),
        progress: updatedVehicle.progress,
        position: updatedVehicle.position,
        gpsCoords: updatedVehicle.gpsCoords,
        headingDeg: updatedVehicle.headingDeg,
        speedKmh: updatedVehicle.speedKmh,
        state: updatedVehicle.state,
        delayMinutes: updatedVehicle.delayMinutes,
        gpsSignalStrength: updatedVehicle.gpsSignalStrength,
        deviationOffset: updatedVehicle.deviationOffset,
        source: 'hardware_tracker',
      });
      setRoutes((prev) =>
        prev.map((r) => (r.id === routeId ? { ...r, driverStatus: 'attention' } : r))
      );
      setAlerts((prev) => [alert, ...prev]);
    },
    [routes, telemetry, students, currentClockLabel]
  );

  // Resolve Safety Alert & Broadcast calm reassuring notice to affected parents
  const handleResolveAlertAndBroadcast = useCallback(
    (alertId: string) => {
      const targetAlert = alerts.find((a) => a.id === alertId);
      if (!targetAlert) return;

      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId ? { ...a, resolved: true, parentBroadcastSent: true } : a
        )
      );

      setRoutes((prev) =>
        prev.map((r) =>
          r.id === targetAlert.routeId ? { ...r, driverStatus: 'en_route' } : r
        )
      );

      const v = telemetry[targetAlert.routeId];
      if (v) {
        safariTelemetryService.ingestLocationUpdate({
          eventId: `res-${targetAlert.routeId}-${Date.now()}`,
          routeId: targetAlert.routeId,
          timestampMs: Date.now(),
          progress: v.progress,
          state: 'in_progress',
          delayMinutes: targetAlert.type === 'extended_delay' ? 6 : 0,
          deviationOffset: { x: 0, y: 0 },
          gpsSignalStrength: 'strong',
          source: 'supabase_realtime',
        });
      }

      const route = routes.find((r) => r.id === targetAlert.routeId);
      setNotifications((prev) => [
        {
          id: `notif-resolved-${Date.now()}`,
          title: `School Transport Update · ${route?.vehicleLabel ?? 'Bus'}`,
          body:
            targetAlert.type === 'extended_delay'
              ? `Oakridge Transport verified a minor traffic delay on ${route?.name}. Vehicle is moving again; expect +6 min adjustment.`
              : `Oakridge Transport checked in with ${route?.driverName}. ${route?.vehicleLabel} is safely back on corridor with all students accounted for.`,
          timestamp: currentClockLabel,
          channel: prefs.smsFallbackEnabled ? 'SMS Fallback' : 'Push',
          category: 'advisory',
          read: false,
        },
        ...prev,
      ]);
    },
    [alerts, routes, telemetry, currentClockLabel, prefs.smsFallbackEnabled]
  );

  const activeNav = NAV_ITEMS.find((n) => n.id === activeTab) ?? NAV_ITEMS[0];
  const unresolvedAlertCount = alerts.filter((a) => !a.resolved).length;

  return (
    <div className="exec-canvas min-h-screen text-[#111827] dark:text-[#F3F4F6]">
      <div className="flex min-h-screen">
        {/* Desktop Left Sidebar — Executive Monochrome (240px) */}
        <aside className="hidden w-[240px] shrink-0 flex-col border-r border-[#E5E7EB]/90 bg-white/90 backdrop-blur-xl lg:flex dark:border-white/10 dark:bg-[#111827]/90">
          <div className="flex h-16 items-center gap-3 border-b border-[#F3F4F6] px-5 dark:border-white/10">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#111827] text-sm font-extrabold text-white shadow-sm dark:bg-white dark:text-[#111827]">
              S
            </div>
            <span className="font-display text-[17px] font-extrabold tracking-tight text-[#111827] whitespace-nowrap dark:text-white">
              Safari
            </span>
          </div>

          <nav aria-label="Primary workspace navigation" className="flex-1 space-y-1.5 p-3.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`btn-spring flex min-h-[44px] w-full items-center justify-between rounded-full px-4 py-2 text-[13px] font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? 'btn-obsidian shadow-sm'
                      : 'text-[#64748B] hover:bg-[#F3F4F6] hover:text-[#111827] dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </span>
                  {item.id === 'school' && unresolvedAlertCount > 0 && (
                    <span
                      className={`font-mono-tabular flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                        isActive
                          ? 'bg-white text-[#111827] dark:bg-[#111827] dark:text-white'
                          : 'bg-[#111827] text-white dark:bg-white dark:text-[#111827]'
                      }`}
                    >
                      {unresolvedAlertCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Founding Principle Footnote */}
          <div className="p-3.5">
            <div className="rounded-[20px] border border-[#E5E7EB]/80 bg-[#F9FAFB] p-4 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#111827] dark:text-white">
                <ShieldCheck className="h-4 w-4 shrink-0 text-[#111827] dark:text-emerald-400" aria-hidden="true" />
                <span>Synthetic Pilot Sandbox</span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-[#64748B] dark:text-slate-400">
                All routes, vehicles, and student records are synthetic. Built around Visibility Without Exposure.
              </p>
            </div>
          </div>
        </aside>

        {/* Main Content Column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Frosted Executive Top Bar */}
          <header className="glass-header sticky top-0 z-30 flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#111827] text-xs font-extrabold text-white lg:hidden dark:bg-white dark:text-[#111827]">
                S
              </div>
              <span className="font-display text-base font-extrabold tracking-tight text-[#111827] lg:hidden dark:text-white">
                Safari
              </span>
              <span className="hidden text-xs font-semibold text-[#64748B] lg:inline dark:text-slate-400">
                {activeNav.breadcrumb}
              </span>
              <span aria-hidden="true" className="hidden text-[#CBD5E1] lg:inline dark:text-slate-700">
                ·
              </span>
              <span className="font-mono-tabular rounded-full border border-[#E5E7EB] bg-white/90 px-2.5 py-0.5 text-[11px] font-semibold text-[#111827] dark:border-white/10 dark:bg-white/10 dark:text-slate-200">
                {currentClockLabel}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => setDarkMode((prev) => !prev)}
                aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
                className="btn-spring inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white/90 px-3.5 py-1.5 text-xs font-semibold text-[#111827] whitespace-nowrap shadow-xs transition-colors hover:bg-[#F3F4F6] dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
              >
                {darkMode ? (
                  <>
                    <Sun className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">Light</span>
                  </>
                ) : (
                  <>
                    <Moon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">Dark</span>
                  </>
                )}
              </button>
            </div>
          </header>

          {/* Main Scrollable Viewport */}
          <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:pb-10">
            {activeTab === 'parent' && (
              <ParentWorkspace
                studentId={PARENT_DEMO_PROFILE.studentId}
                students={students}
                routes={routes}
                telemetry={telemetry}
                shift={shift}
                onShiftChange={handleShiftChange}
                notifications={notifications}
                prefs={prefs}
                onUpdatePrefs={setPrefs}
                onMarkNotificationsRead={() =>
                  setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
                }
                onOpenAttendantDemo={() => setActiveTab('driver')}
              />
            )}

            {activeTab === 'school' && (
              <SchoolDashboard
                routes={routes}
                students={students}
                telemetry={telemetry}
                alerts={alerts}
                auditLog={auditLog}
                shift={shift}
                isSimRunning={isSimRunning}
                simSpeed={simSpeed}
                onToggleSim={() => setIsSimRunning((prev) => !prev)}
                onChangeSimSpeed={setSimSpeed}
                onShiftChange={handleShiftChange}
                onResetSimulation={handleResetSimulation}
                onTriggerException={handleTriggerException}
                onResolveAlertAndBroadcast={handleResolveAlertAndBroadcast}
                onCreateRoute={handleCreateRoute}
                onUpdateRoute={handleUpdateRoute}
                onAddStudent={handleAddStudent}
                onReassignStudent={handleReassignStudent}
                onRemoveStudent={handleRemoveStudent}
              />
            )}

            {activeTab === 'driver' && (
              <DriverAttendantWorkspace
                routes={routes}
                students={students}
                telemetry={telemetry}
                shift={shift}
                onUpdateStudentBoarding={handleUpdateStudentBoarding}
                onTriggerDriverAssist={(routeId) =>
                  handleTriggerException('extended_delay', routeId)
                }
              />
            )}

            {activeTab === 'blueprint' && <ProductionBlueprint />}
          </main>
        </div>
      </div>

      {/* Mobile Frosted Monochrome Bottom Navigation Bar */}
      <nav
        aria-label="Mobile workspace navigation"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/80 bg-white/85 backdrop-blur-xl lg:hidden dark:border-white/10 dark:bg-[#111827]/90"
      >
        <div className="grid h-16 grid-cols-4 items-center px-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-[48px] flex-col items-center justify-center gap-1 text-[11px] transition-colors ${
                  isActive
                    ? 'font-bold text-[#111827] dark:text-white'
                    : 'font-medium text-[#9CA3AF] hover:text-[#111827] dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="truncate">{item.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
