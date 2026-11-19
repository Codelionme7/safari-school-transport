import React, { useState } from 'react';
import {
  AlertTriangle,
  Bus,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Lock,
  MapPin,
  QrCode,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  TrendingUp,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import {
  BoardingStatus,
  RouteDefinition,
  ShiftMode,
  StudentRecord,
  VehicleTelemetry,
  VerificationMethod,
} from '../types/safari';
import {
  formatGpsCoords,
  getOrderedStopsForShift,
  validateStudentQrScan,
} from '../engine/simulation';

interface DriverAttendantWorkspaceProps {
  routes: RouteDefinition[];
  students: StudentRecord[];
  telemetry: Record<string, VehicleTelemetry>;
  shift: ShiftMode;
  onUpdateStudentBoarding: (
    studentId: string,
    status: BoardingStatus,
    options?: { method?: VerificationMethod; hasPhotoProof?: boolean }
  ) => void;
  onTriggerDriverAssist: (routeId: string) => void;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export const DriverAttendantWorkspace: React.FC<DriverAttendantWorkspaceProps> = ({
  routes,
  students,
  telemetry,
  shift,
  onUpdateStudentBoarding,
  onTriggerDriverAssist,
}) => {
  const [roleView, setRoleView] = useState<'attendant' | 'driver'>('attendant');
  const [activeRouteId, setActiveRouteId] = useState<string>(routes[0]?.id ?? 'route-04');
  const [simulateStopped, setSimulateStopped] = useState(false);

  // Secure Boarding QR + Photo Proof state
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [qrInput, setQrInput] = useState('');
  const [attachPhotoProof, setAttachPhotoProof] = useState(true);
  const [scanResult, setScanResult] = useState<{
    tone: 'success' | 'error' | 'warning';
    title: string;
    detail: string;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const route = routes.find((r) => r.id === activeRouteId) ?? routes[0];
  const vehicle = telemetry[route.id];
  const routeStudents = students.filter((s) => s.routeId === route.id);
  const otherBusStudent = students.find((s) => s.routeId !== route.id);
  const orderedStops = getOrderedStopsForShift(route, shift);
  const nextStop =
    orderedStops.find((s) => s.id === vehicle?.nextStopId) ??
    orderedStops[orderedStops.length - 1];

  const confirmedCount = routeStudents.filter((s) =>
    shift === 'morning'
      ? s.boardingStatus === 'boarded'
      : s.boardingStatus === 'dropped_off'
  ).length;
  const absentCount = routeStudents.filter((s) => s.boardingStatus === 'not_boarded').length;
  const pendingCount = Math.max(0, routeStudents.length - confirmedCount - absentCount);
  const confirmedPct = routeStudents.length
    ? Math.round((confirmedCount / routeStudents.length) * 100)
    : 0;

  const isVehicleInMotion = Boolean(vehicle?.isMoving) && !simulateStopped;

  const triggerToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((cur) => (cur === msg ? null : cur));
    }, 3400);
  };

  const processQrCode = (code: string) => {
    const result = validateStudentQrScan({
      qrCodeInput: code,
      activeRouteId: route.id,
      students,
      routes,
    });

    if (result.status === 'valid') {
      const targetStatus: BoardingStatus =
        shift === 'morning' ? 'boarded' : 'dropped_off';
      onUpdateStudentBoarding(result.student.id, targetStatus, {
        method: 'qr_scan',
        hasPhotoProof: attachPhotoProof,
      });
      setScanResult({
        tone: 'success',
        title: `${
          shift === 'morning' ? 'QR Boarding Verified' : 'QR Guardian Handover Verified'
        } · ${result.student.firstName} ${result.student.lastName}`,
        detail: `Pass ${result.student.qrCodeId} validated on ${route.vehicleLabel}${
          attachPhotoProof ? ' · Timestamped photo proof captured' : ''
        } · Parent notified immediately.`,
      });
      triggerToast(`${result.student.firstName} ${result.student.lastName} verified via QR Pass`);
      setQrInput('');
      return;
    }

    if (result.status === 'wrong_route') {
      setScanResult({
        tone: 'error',
        title: `Wrong Vehicle Safeguard · ${result.student.firstName} ${result.student.lastName}`,
        detail: `Pass ${result.student.qrCodeId} belongs to ${result.expectedVehicle}, NOT ${route.vehicleLabel}. Do not board without School Transport authorization.`,
      });
      return;
    }

    setScanResult({
      tone: 'warning',
      title: 'Unrecognized Student Pass',
      detail: result.message,
    });
  };

  const exceptionStudents = routeStudents.filter(
    (s) => s.boardingStatus === 'not_boarded' || s.boardingStatus === 'expected'
  );

  return (
    <div className="space-y-5">
      {/* Header & Role Mode Pill Switcher */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#64748B] dark:text-slate-400">
            In-Vehicle Companion · Secure Handover &amp; Zero Driver Distraction
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#111827] dark:text-white">
            Driver HUD &amp; Attendant Handover
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div
            role="group"
            aria-label="In-vehicle role mode"
            className="inline-flex rounded-full border border-[#E5E7EB]/90 bg-white/90 p-1 shadow-xs backdrop-blur-md dark:border-white/10 dark:bg-[#111827]/80"
          >
            <button
              type="button"
              onClick={() => setRoleView('attendant')}
              className={`min-h-[38px] rounded-full px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                roleView === 'attendant'
                  ? 'bg-[#111827] text-white shadow-sm dark:bg-white dark:text-[#111827]'
                  : 'text-[#64748B] hover:text-[#111827] dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Attendant Handover
            </button>
            <button
              type="button"
              onClick={() => setRoleView('driver')}
              className={`min-h-[38px] rounded-full px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                roleView === 'driver'
                  ? 'bg-[#111827] text-white shadow-sm dark:bg-white dark:text-[#111827]'
                  : 'text-[#64748B] hover:text-[#111827] dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Driver Zero-Touch HUD
            </button>
          </div>

          <select
            aria-label="Select assigned bus route"
            value={activeRouteId}
            onChange={(e) => {
              setActiveRouteId(e.target.value);
              setScanResult(null);
            }}
            className="h-10 rounded-full border border-[#E5E7EB] bg-white/90 px-4 text-xs font-semibold text-[#111827] shadow-xs focus:border-[#111827] focus:outline-none dark:border-white/15 dark:bg-[#111827]/90 dark:text-white"
          >
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.vehicleLabel} · {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {roleView === 'attendant' ? (
        <div className="space-y-5">
          {/* Offline Sync Minimal Banner (Image_3) */}
          <div className="glass-card flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
              <span className="truncate text-xs font-medium text-[#4B5563] dark:text-slate-300">
                Offline Cache: {students.length} roster records encrypted locally ·{' '}
                <span className="font-mono-tabular">
                  {vehicle ? formatGpsCoords(vehicle.gpsCoords) : '—'}
                </span>
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 text-[11px] font-bold text-[#111827] dark:text-white">
              <RefreshCw className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>Auto-sync</span>
            </div>
          </div>

          {/* 4-Column Executive KPI Grid: 1 Featured Dark Card + 3 Frosted White Cards (Image_3) */}
          <section
            aria-label="Route boarding summary"
            className="grid grid-cols-2 gap-3 sm:grid-cols-4"
          >
            {/* Card 1: Featured Deep Liquid Dark Glass Card (Boarded) */}
            <div className="glass-card-dark relative flex flex-col justify-between overflow-hidden rounded-[22px] p-4 text-white">
              <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-emerald-500/20 blur-xl" />
              <span className="text-[10px] font-bold tracking-wider text-slate-300 uppercase">
                {shift === 'morning' ? 'Boarded' : 'Handed Over'}
              </span>
              <p className="font-mono-tabular my-1.5 text-3xl font-extrabold leading-none tracking-tight text-white">
                {confirmedCount}
              </p>
              <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="font-mono-tabular">{confirmedPct}% confirmed</span>
              </div>
            </div>

            {/* Card 2: Expected */}
            <div className="glass-card flex flex-col justify-between rounded-[22px] p-4">
              <span className="text-[10px] font-bold tracking-wider text-[#64748B] uppercase dark:text-slate-400">
                Expected
              </span>
              <p className="font-mono-tabular my-1.5 text-3xl font-extrabold leading-none tracking-tight text-[#111827] dark:text-white">
                {routeStudents.length}
              </p>
              <span className="text-[11px] font-medium text-[#64748B] dark:text-slate-400">
                Total manifest
              </span>
            </div>

            {/* Card 3: Not Present */}
            <div className="glass-card flex flex-col justify-between rounded-[22px] p-4">
              <span className="text-[10px] font-bold tracking-wider text-[#64748B] uppercase dark:text-slate-400">
                Not Present
              </span>
              <p className="font-mono-tabular my-1.5 text-3xl font-extrabold leading-none tracking-tight text-[#111827] dark:text-white">
                {absentCount}
              </p>
              <span className="text-[11px] font-medium text-[#64748B] dark:text-slate-400">
                Flagged absent
              </span>
            </div>

            {/* Card 4: Pending */}
            <div className="glass-card flex flex-col justify-between rounded-[22px] p-4">
              <span className="text-[10px] font-bold tracking-wider text-[#64748B] uppercase dark:text-slate-400">
                Pending
              </span>
              <p className="font-mono-tabular my-1.5 text-3xl font-extrabold leading-none tracking-tight text-[#111827] dark:text-white">
                {pendingCount}
              </p>
              <span className="text-[11px] font-medium text-[#64748B] dark:text-slate-400">
                Remaining stops
              </span>
            </div>
          </section>

          {/* Trip Header & Quick QR Verification Control Card (Image_3) */}
          <section
            aria-label="Secure boarding verification controls"
            className="glass-card rounded-[24px] p-5"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-[#64748B] uppercase dark:text-slate-400">
                  <Bus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {route.vehicleLabel} · {route.plateNumber} · Attendant {route.attendantName}
                  </span>
                </div>
                <h2 className="mt-1 text-lg font-extrabold tracking-tight text-[#111827] dark:text-white">
                  {route.name} ({shift === 'morning' ? 'Morning Run' : 'Afternoon Drop-Off'})
                </h2>
                <p className="mt-0.5 text-xs text-[#64748B] dark:text-slate-400">
                  Scan student QR passes or tap a manifest row below. Parents receive instant boarding and campus arrival alerts.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <label className="glass-subcard flex min-h-[44px] cursor-pointer items-center gap-2 rounded-2xl px-3.5 py-2 text-xs font-semibold text-[#111827] dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={attachPhotoProof}
                    onChange={(e) => setAttachPhotoProof(e.target.checked)}
                    className="h-4 w-4 rounded border-[#CBD5E1] accent-[#111827]"
                  />
                  <Camera className="h-4 w-4 text-[#111827] dark:text-emerald-400" aria-hidden="true" />
                  <span>Attach Photo &amp; GPS Proof</span>
                </label>

                <button
                  type="button"
                  onClick={() => setShowQrScanner((prev) => !prev)}
                  aria-expanded={showQrScanner}
                  className="btn-spring btn-obsidian gleam-sweep inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-bold whitespace-nowrap"
                >
                  <QrCode className="h-4 w-4" aria-hidden="true" />
                  <span>{showQrScanner ? 'Close QR Scanner' : 'Scan Student QR Pass'}</span>
                </button>
              </div>
            </div>

            {/* Optical QR Reader & Pass Entry Panel (Image_3 Laser Reticle + Real Validation) */}
            {showQrScanner && (
              <div className="mt-5 border-t border-[#E5E7EB]/80 pt-5 dark:border-white/10">
                <div className="grid grid-cols-1 items-center gap-5 lg:grid-cols-12">
                  {/* Optical Viewfinder Reticle (Image_3) */}
                  <div className="flex flex-col items-center lg:col-span-3">
                    <div className="relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-700 bg-[#0B0F17] shadow-inner">
                      <div className="absolute left-2.5 top-2.5 h-5 w-5 rounded-tl border-l-2 border-t-2 border-white" />
                      <div className="absolute right-2.5 top-2.5 h-5 w-5 rounded-tr border-r-2 border-t-2 border-white" />
                      <div className="absolute bottom-2.5 left-2.5 h-5 w-5 rounded-bl border-b-2 border-l-2 border-white" />
                      <div className="absolute bottom-2.5 right-2.5 h-5 w-5 rounded-br border-b-2 border-r-2 border-white" />
                      <div className="scan-beam absolute left-3 right-3 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_10px_#34d399]" />
                      <QrCode className="h-12 w-12 text-slate-600" aria-hidden="true" />
                    </div>
                    <p className="mt-2 text-[11px] font-semibold text-[#64748B] dark:text-slate-400">
                      Optical QR Reader Active
                    </p>
                  </div>

                  {/* Manual / Hardware Barcode Input */}
                  <div className="space-y-3 lg:col-span-4">
                    <p className="text-xs font-bold text-[#111827] dark:text-white">
                      Enter or Scan Student Pass ID
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        processQrCode(qrInput);
                      }}
                      className="flex gap-2"
                    >
                      <input
                        type="text"
                        value={qrInput}
                        onChange={(e) => setQrInput(e.target.value)}
                        placeholder="e.g. SAF-NR04-01"
                        aria-label="Student QR pass code"
                        className="font-mono-tabular h-11 flex-1 rounded-2xl border border-[#E5E7EB] bg-white px-3.5 text-xs text-[#111827] focus:border-[#111827] focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-white"
                      />
                      <button
                        type="submit"
                        className="btn-spring btn-obsidian min-h-[44px] rounded-2xl px-4 text-xs font-bold whitespace-nowrap"
                      >
                        Verify Pass
                      </button>
                    </form>
                    <p className="text-[11px] text-[#64748B] dark:text-slate-400">
                      Live GPS stamp:{' '}
                      <span className="font-mono-tabular font-semibold text-[#111827] dark:text-slate-200">
                        {vehicle ? formatGpsCoords(vehicle.gpsCoords) : '—'}
                      </span>
                    </p>
                  </div>

                  {/* Instant Simulated Quick-Scan Student QR Passes */}
                  <div className="space-y-2.5 lg:col-span-5">
                    <p className="text-xs font-bold text-[#111827] dark:text-white">
                      Instant QR Pass Tap ({route.vehicleLabel})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {routeStudents.map((stu) => (
                        <button
                          key={stu.id}
                          type="button"
                          onClick={() => processQrCode(stu.qrCodeId)}
                          className="btn-spring glass-subcard inline-flex min-h-[40px] items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold text-[#111827] hover:border-[#111827] dark:text-white dark:hover:border-white/40"
                        >
                          <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>
                            Scan {stu.firstName} ({stu.qrCodeId})
                          </span>
                        </button>
                      ))}

                      {otherBusStudent && (
                        <button
                          type="button"
                          onClick={() => processQrCode(otherBusStudent.qrCodeId)}
                          className="btn-spring inline-flex min-h-[40px] items-center gap-2 rounded-full border border-amber-300 bg-amber-50/90 px-3.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300"
                        >
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>
                            Test Wrong-Bus Pass ({otherBusStudent.firstName})
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Instant Scan Feedback Banner */}
                {scanResult && (
                  <div
                    role="status"
                    data-testid="qr-scan-feedback"
                    className={`pop-bounce mt-4 rounded-2xl border p-4 text-xs ${
                      scanResult.tone === 'success'
                        ? 'border-emerald-200 bg-emerald-50/80 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                        : scanResult.tone === 'error'
                        ? 'border-red-200 bg-red-50/90 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200'
                        : 'border-amber-200 bg-amber-50/80 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                    }`}
                  >
                    <p className="font-bold">{scanResult.title}</p>
                    <p className="mt-0.5 opacity-90">{scanResult.detail}</p>
                  </div>
                )}
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left 8 Cols: Student Manifest Frosted Cards (Image_3) */}
            <section
              aria-label="Attendant student handover checklist"
              className="space-y-3 lg:col-span-8"
            >
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-extrabold text-[#111827] dark:text-white">
                    Student Manifest
                  </h2>
                  <span className="rounded-full border border-[#E5E7EB] bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#4B5563] dark:border-white/10 dark:bg-white/10 dark:text-slate-300">
                    {nextStop?.name ?? 'All Stops'}
                  </span>
                </div>
                <span className="font-mono-tabular text-xs font-semibold text-[#64748B] dark:text-slate-400">
                  {confirmedCount}/{routeStudents.length} confirmed
                </span>
              </div>

              <ul className="space-y-3">
                {routeStudents.map((student) => {
                  const stop = route.stops.find((st) => st.id === student.stopId);
                  const isConfirmed =
                    shift === 'morning'
                      ? student.boardingStatus === 'boarded'
                      : student.boardingStatus === 'dropped_off';
                  const isAbsent = student.boardingStatus === 'not_boarded';

                  return (
                    <li
                      key={student.id}
                      className={`glass-card rounded-[22px] p-4 transition-all ${
                        isAbsent ? 'opacity-70' : ''
                      }`}
                    >
                      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3.5">
                          <div className="relative shrink-0">
                            <div
                              className={`flex h-11 w-11 items-center justify-center rounded-full text-xs font-extrabold ${
                                isConfirmed
                                  ? 'bg-[#111827] text-white dark:bg-white dark:text-[#111827]'
                                  : isAbsent
                                  ? 'bg-[#E5E7EB] text-[#64748B] dark:bg-white/10 dark:text-slate-400'
                                  : 'border border-[#E5E7EB] bg-white text-[#111827] dark:border-white/15 dark:bg-white/10 dark:text-white'
                              }`}
                            >
                              {getInitials(`${student.firstName} ${student.lastName}`)}
                            </div>
                            <span
                              className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white dark:border-[#111827] ${
                                isConfirmed
                                  ? 'bg-emerald-500'
                                  : isAbsent
                                  ? 'bg-slate-400'
                                  : 'bg-amber-500'
                              }`}
                            />
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <h3
                                className={`text-sm font-extrabold ${
                                  isAbsent
                                    ? 'text-[#64748B] line-through dark:text-slate-400'
                                    : 'text-[#111827] dark:text-white'
                                }`}
                              >
                                {student.firstName} {student.lastName}
                              </h3>
                              <span className="text-xs text-[#64748B] dark:text-slate-400">
                                · {student.grade}
                              </span>
                              <span className="font-mono-tabular rounded-md bg-[#F3F4F6] px-1.5 py-0.5 text-[10px] font-semibold text-[#4B5563] dark:bg-white/10 dark:text-slate-300">
                                {student.qrCodeId}
                              </span>
                            </div>

                            <p className="mt-0.5 flex items-center gap-1 text-xs text-[#64748B] dark:text-slate-400">
                              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                              <span className="truncate">
                                {stop?.name} · Guardians: {student.guardianName} /{' '}
                                {student.authorizedBackupGuardian}
                              </span>
                            </p>

                            {student.handoverProof && isConfirmed && (
                              <p className="mt-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                                Verified via{' '}
                                {student.handoverProof.method === 'qr_scan'
                                  ? 'QR Pass'
                                  : 'Checklist'}
                                {student.handoverProof.hasPhotoProof ? ' + Photo Proof' : ''} at{' '}
                                {student.handoverProof.timestamp} · GPS{' '}
                                <span className="font-mono-tabular">
                                  {student.handoverProof.gpsLabel}
                                </span>
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {isConfirmed ? (
                            <button
                              type="button"
                              onClick={() => onUpdateStudentBoarding(student.id, 'expected')}
                              aria-label={`Undo confirmation for ${student.firstName} ${student.lastName}`}
                              className="btn-spring inline-flex min-h-[42px] items-center gap-1.5 rounded-full bg-[#111827] px-4 py-2 text-xs font-bold text-white whitespace-nowrap shadow-xs hover:bg-black dark:bg-white dark:text-[#111827]"
                            >
                              <Check className="h-3.5 w-3.5 text-emerald-400 dark:text-emerald-600" aria-hidden="true" />
                              <span>
                                {shift === 'morning' ? 'Boarded' : 'Handed Over'}{' '}
                                {student.handoverProof?.timestamp ?? student.boardedAt ?? ''}
                              </span>
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  onUpdateStudentBoarding(
                                    student.id,
                                    shift === 'morning' ? 'boarded' : 'dropped_off',
                                    {
                                      method: 'checklist',
                                      hasPhotoProof: attachPhotoProof,
                                    }
                                  );
                                  triggerToast(
                                    `${student.firstName} ${student.lastName} confirmed at ${stop?.name}`
                                  );
                                }}
                                aria-label={
                                  shift === 'morning'
                                    ? `Confirm boarding for ${student.firstName} ${student.lastName}`
                                    : `Confirm guardian drop-off for ${student.firstName} ${student.lastName}`
                                }
                                className="btn-spring btn-obsidian gleam-sweep inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl px-4 py-2 text-xs font-bold whitespace-nowrap"
                              >
                                <UserCheck className="h-4 w-4" aria-hidden="true" />
                                <span>
                                  {shift === 'morning'
                                    ? 'Confirm Boarding'
                                    : 'Confirm Drop-Off'}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setShowQrScanner(true);
                                  processQrCode(student.qrCodeId);
                                }}
                                aria-label={`Scan QR for ${student.firstName} ${student.lastName}`}
                                className="btn-spring glass-subcard inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs font-bold text-[#111827] whitespace-nowrap hover:border-[#111827] dark:text-white"
                              >
                                <QrCode className="h-4 w-4" aria-hidden="true" />
                                <span>Scan QR</span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateStudentBoarding(
                                    student.id,
                                    isAbsent ? 'expected' : 'not_boarded',
                                    { method: 'checklist', hasPhotoProof: false }
                                  )
                                }
                                aria-label={`Flag ${student.firstName} ${student.lastName} as not present`}
                                className={`btn-spring inline-flex min-h-[44px] items-center gap-1.5 rounded-2xl border px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                                  isAbsent
                                    ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300'
                                    : 'border-[#E5E7EB] bg-white/80 text-[#4B5563] hover:bg-[#F3F4F6] dark:border-white/15 dark:bg-white/5 dark:text-slate-300'
                                }`}
                              >
                                <UserX className="h-4 w-4" aria-hidden="true" />
                                <span>{isAbsent ? 'Flagged Absent' : 'Not Present'}</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Right 4 Cols: Route Exceptions + Next Stop + Attendant Actions (Image_3) */}
            <aside className="space-y-4 lg:col-span-4">
              {/* Route Exceptions Card */}
              <section className="glass-card rounded-[24px] p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-[#111827] dark:text-white">
                    Route Attention Queue
                  </h3>
                  <span className="rounded-full bg-[#111827] px-2.5 py-0.5 text-[11px] font-bold text-white dark:bg-white dark:text-[#111827]">
                    {exceptionStudents.length} Pending
                  </span>
                </div>

                {exceptionStudents.length === 0 ? (
                  <p className="mt-3 text-xs text-[#64748B] dark:text-slate-400">
                    All students on {route.vehicleLabel} have been verified.
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {exceptionStudents.slice(0, 3).map((stu) => {
                      const st = route.stops.find((x) => x.id === stu.stopId);
                      return (
                        <div
                          key={stu.id}
                          className="glass-subcard flex items-center justify-between gap-2 rounded-2xl p-2.5"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#111827] text-[11px] font-bold text-white dark:bg-white dark:text-[#111827]">
                              {getInitials(`${stu.firstName} ${stu.lastName}`)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-bold text-[#111827] dark:text-white">
                                {stu.firstName} {stu.lastName}
                              </p>
                              <p className="truncate text-[11px] text-[#64748B] dark:text-slate-400">
                                {stu.boardingStatus === 'not_boarded'
                                  ? 'Flagged absent at stop'
                                  : `Awaiting at ${st?.name}`}
                              </p>
                            </div>
                          </div>
                          <Clock className="h-4 w-4 shrink-0 text-[#64748B]" aria-hidden="true" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Next Stop Telemetry Card */}
              <section className="glass-card rounded-[24px] p-5">
                <p className="text-[10px] font-bold tracking-wider text-[#64748B] uppercase dark:text-slate-400">
                  Upcoming Stop · {route.name}
                </p>
                <p className="mt-1.5 text-lg font-extrabold text-[#111827] dark:text-white">
                  {nextStop?.name ?? 'Route Complete'}
                </p>
                <p className="font-mono-tabular mt-1 text-xs font-bold text-[#111827] dark:text-emerald-400">
                  ETA {vehicle?.etaToNextStopMin ?? 0} min · Traffic: {route.trafficLevel}
                </p>
                <p className="font-mono-tabular mt-1 text-[11px] text-[#64748B] dark:text-slate-400">
                  GPS {vehicle ? formatGpsCoords(vehicle.gpsCoords) : '—'} ·{' '}
                  {route.hardwareTrackerId}
                </p>
              </section>

              {/* Attendant Quick Actions Bottom Panel (Image_3) */}
              <section className="glass-card space-y-2.5 rounded-[24px] p-5">
                <span className="text-[10px] font-bold tracking-wider text-[#64748B] uppercase dark:text-slate-400">
                  Attendant Actions
                </span>

                <button
                  type="button"
                  onClick={() => {
                    onTriggerDriverAssist(route.id);
                    triggerToast(`Delay alert dispatched for ${route.vehicleLabel}`);
                  }}
                  className="btn-spring glass-subcard flex min-h-[48px] w-full items-center justify-between rounded-2xl px-3.5 py-2.5 text-left hover:border-[#111827] dark:hover:border-white/30"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#111827] text-white dark:bg-white dark:text-[#111827]">
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-[#111827] dark:text-white">
                        1-Tap Delay Alert (+5m)
                      </p>
                      <p className="truncate text-[11px] text-[#64748B] dark:text-slate-400">
                        Notifies School Ops &amp; route parents
                      </p>
                    </div>
                  </div>
                  <Send className="h-4 w-4 shrink-0 text-[#111827] dark:text-white" aria-hidden="true" />
                </button>

                <p className="pt-1 text-[11px] leading-relaxed text-[#64748B] dark:text-slate-400">
                  Boarding checks are performed strictly by the attendant at full stops—never by the driver while operating the bus.
                </p>
              </section>
            </aside>
          </div>
        </div>
      ) : (
        /* Driver Zero-Touch HUD — Obsidian Dark Glass (Image_14 Dark Card) */
        <section
          aria-label="Driver zero-touch display"
          className="glass-card-dark rounded-[28px] p-6 text-white sm:p-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
                <Radio className="h-5 w-5 text-emerald-400" aria-hidden="true" />
              </div>
              <div>
                <p className="font-mono-tabular text-xs text-slate-400">
                  Automated Hardwired Telemetry · {route.hardwareTrackerId} ·{' '}
                  {vehicle ? formatGpsCoords(vehicle.gpsCoords) : '—'}
                </p>
                <p className="text-sm font-bold text-white">
                  {route.vehicleLabel} · {route.driverName}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSimulateStopped((prev) => !prev)}
              className="btn-spring min-h-[42px] rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/20"
            >
              {simulateStopped ? 'Resume Driving Lock' : 'Simulate Vehicle Stopped (0 km/h)'}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-8 py-8 lg:grid-cols-12 lg:items-center">
            <div className="space-y-3 lg:col-span-7">
              <p className="text-xs font-semibold text-emerald-400">
                Next Scheduled Stop · Traffic: {route.trafficLevel} · No driver tap required
              </p>
              <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                {nextStop?.name ?? 'Oakridge Academy'}
              </h2>
              <p className="font-mono-tabular text-lg font-semibold text-slate-300">
                ETA {vehicle?.etaToNextStopMin ?? 0} min · Speed{' '}
                {simulateStopped ? 0 : vehicle?.speedKmh ?? 0} km/h
              </p>
            </div>

            <div className="lg:col-span-5">
              <div className="rounded-[22px] border border-white/15 bg-white/5 p-5">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <Lock className="h-4 w-4 text-amber-400" aria-hidden="true" />
                  <span>
                    {isVehicleInMotion
                      ? 'Motion Lock Active (> 5 km/h)'
                      : 'Vehicle Stationary · Controls Unlocked'}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                  {isVehicleInMotion
                    ? 'Interactive buttons are automatically locked while the bus is moving. GPS reporting and parent approaching alerts run automatically.'
                    : 'Vehicle is stopped. Driver may trigger a one-tap dispatch delay/assistance request if needed.'}
                </p>

                <button
                  type="button"
                  disabled={isVehicleInMotion}
                  onClick={() => {
                    onTriggerDriverAssist(route.id);
                    triggerToast(`Dispatch alert sent from ${route.vehicleLabel}`);
                  }}
                  className={`mt-4 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-bold transition-all ${
                    isVehicleInMotion
                      ? 'cursor-not-allowed bg-white/10 text-slate-400'
                      : 'btn-spring bg-white text-[#111827] hover:bg-slate-100'
                  }`}
                >
                  <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {isVehicleInMotion
                      ? 'Pull Over to Contact Dispatch'
                      : 'Alert School Dispatch (Delay / Assist)'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Liquid Glass Top Notification Toast (Image_3) */}
      {toast && (
        <div
          role="status"
          className="glass-card-dark fixed bottom-20 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center justify-between gap-3 rounded-2xl px-4 py-3 text-white shadow-2xl lg:bottom-6"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
            <span className="truncate text-xs font-semibold">{toast}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss status message"
            className="text-slate-400 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
};
