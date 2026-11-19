import React, { useState } from 'react';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import {
  DriverStatus,
  RouteDefinition,
  StudentRecord,
  TrafficLevel,
} from '../types/safari';
import { RouteDefinitionCard } from './RouteDefinitionCard';

interface SchoolRouteManagerProps {
  routes: RouteDefinition[];
  students: StudentRecord[];
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

export const SchoolRouteManager: React.FC<SchoolRouteManagerProps> = ({
  routes,
  students,
  onCreateRoute,
  onUpdateRoute,
  onAddStudent,
  onReassignStudent,
  onRemoveStudent,
}) => {
  // Create Route Form State
  const [routeName, setRouteName] = useState('');
  const [routeCode, setRouteCode] = useState('');
  const [vehicleLabel, setVehicleLabel] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [attendantName, setAttendantName] = useState('');
  const [corridorSector, setCorridorSector] = useState<
    'northeast' | 'northwest' | 'southeast'
  >('northeast');
  const [firstStopName, setFirstStopName] = useState('');
  const [secondStopName, setSecondStopName] = useState('');
  const [trafficLevel, setTrafficLevel] = useState<TrafficLevel>('clear');
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeFeedback, setRouteFeedback] = useState<string | null>(null);

  // Inline Edit Route State
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [editVehicle, setEditVehicle] = useState('');
  const [editPlate, setEditPlate] = useState('');
  const [editDriver, setEditDriver] = useState('');
  const [editDriverStatus, setEditDriverStatus] = useState<DriverStatus>('en_route');
  const [editAttendant, setEditAttendant] = useState('');
  const [editTraffic, setEditTraffic] = useState<TrafficLevel>('clear');

  // Add Student Form State
  const [stuFirst, setStuFirst] = useState('');
  const [stuLast, setStuLast] = useState('');
  const [stuGrade, setStuGrade] = useState('Grade 4');
  const [stuRouteId, setStuRouteId] = useState(routes[0]?.id ?? '');
  const activeRouteForStudent =
    routes.find((r) => r.id === stuRouteId) ?? routes[0];
  const nonCampusStops = (activeRouteForStudent?.stops ?? []).filter(
    (s) => !s.isSchoolCampus
  );
  const [stuStopId, setStuStopId] = useState(nonCampusStops[0]?.id ?? '');
  const [stuGuardian, setStuGuardian] = useState('');
  const [stuBackup, setStuBackup] = useState('');
  const [studentError, setStudentError] = useState<string | null>(null);
  const [studentFeedback, setStudentFeedback] = useState<string | null>(null);

  const handleStartEdit = (route: RouteDefinition) => {
    setEditingRouteId(route.id);
    setEditVehicle(route.vehicleLabel);
    setEditPlate(route.plateNumber);
    setEditDriver(route.driverName);
    setEditDriverStatus(route.driverStatus);
    setEditAttendant(route.attendantName);
    setEditTraffic(route.trafficLevel);
  };

  const handleSaveEdit = (routeId: string) => {
    if (!editVehicle.trim() || !editDriver.trim() || !editAttendant.trim()) return;
    onUpdateRoute(routeId, {
      vehicleLabel: editVehicle.trim(),
      plateNumber: editPlate.trim().toUpperCase(),
      driverName: editDriver.trim(),
      driverStatus: editDriverStatus,
      attendantName: editAttendant.trim(),
      trafficLevel: editTraffic,
    });
    setEditingRouteId(null);
  };

  const handleCreateRouteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !routeName.trim() ||
      !routeCode.trim() ||
      !vehicleLabel.trim() ||
      !plateNumber.trim() ||
      !driverName.trim() ||
      !attendantName.trim() ||
      !firstStopName.trim() ||
      !secondStopName.trim()
    ) {
      setRouteError(
        'Please complete route name, code, vehicle, plate, driver, attendant, and both pickup stops.'
      );
      return;
    }

    onCreateRoute({
      name: routeName,
      code: routeCode,
      vehicleLabel,
      plateNumber,
      driverName,
      attendantName,
      corridorSector,
      firstStopName,
      secondStopName,
      trafficLevel,
    });

    setRouteFeedback(`${vehicleLabel.trim()} assigned to ${routeName.trim()} and added to live GPS fleet.`);
    setRouteError(null);
    setRouteName('');
    setRouteCode('');
    setVehicleLabel('');
    setPlateNumber('');
    setDriverName('');
    setAttendantName('');
    setFirstStopName('');
    setSecondStopName('');
    setTrafficLevel('clear');
  };

  const handleRouteSelectForStudent = (nextRouteId: string) => {
    setStuRouteId(nextRouteId);
    const nextRoute = routes.find((r) => r.id === nextRouteId);
    const firstNonCampus = nextRoute?.stops.find((s) => !s.isSchoolCampus);
    setStuStopId(firstNonCampus?.id ?? '');
  };

  const handleAddStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedStopId =
      nonCampusStops.find((s) => s.id === stuStopId)?.id ?? nonCampusStops[0]?.id ?? '';
    if (!stuFirst.trim() || !stuLast.trim() || !stuGuardian.trim() || !stuRouteId || !resolvedStopId) {
      setStudentError('Student first name, last name, primary guardian, and route stop are required.');
      return;
    }

    onAddStudent({
      firstName: stuFirst.trim(),
      lastName: stuLast.trim(),
      grade: stuGrade,
      routeId: stuRouteId,
      stopId: resolvedStopId,
      guardianName: stuGuardian.trim(),
      authorizedBackupGuardian: stuBackup.trim() || `${stuGuardian.trim()} (Alternate)`,
    });

    setStudentFeedback(`${stuFirst.trim()} ${stuLast.trim()} enrolled with QR pass on ${activeRouteForStudent?.vehicleLabel}.`);
    setStudentError(null);
    setStuFirst('');
    setStuLast('');
    setStuGuardian('');
    setStuBackup('');
  };

  const fieldCls =
    'mt-1.5 h-10 w-full rounded-2xl border border-gray-200 bg-white/85 px-3.5 text-xs text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#111827] focus:bg-white focus:outline-none dark:border-white/15 dark:bg-slate-900/80 dark:text-white dark:focus:border-white';

  return (
    <div className="space-y-6">
      {/* Existing Routes & Vehicle Assignments */}
      <section
        aria-label="Route and vehicle assignments"
        className="glass-card overflow-hidden rounded-[24px]"
      >
        <div className="border-b border-gray-200/70 px-6 py-4 dark:border-white/10">
          <h2 className="text-sm font-bold text-[#111827] dark:text-white">
            Active Routes, Vehicle Assignments &amp; Traffic Control
          </h2>
          <p className="mt-0.5 text-xs text-[#64748B] dark:text-slate-400">
            Edit vehicle assignments, update driver availability, or adjust live corridor traffic to recalculate fleet ETAs.
          </p>
        </div>

        <div className="divide-y divide-gray-200/60 dark:divide-white/10">
          {routes.map((route) => {
            const isEditing = editingRouteId === route.id;
            const assignedCount = students.filter((s) => s.routeId === route.id).length;

            return (
              <div key={route.id} className="p-5 sm:px-6">
                {isEditing ? (
                  <div className="glass-subcard space-y-4 rounded-2xl p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-[#111827] dark:text-white">
                        Editing {route.name} ({route.code})
                      </p>
                      <button
                        type="button"
                        onClick={() => setEditingRouteId(null)}
                        className="rounded-full px-3 py-1 text-xs font-semibold text-[#64748B] hover:bg-gray-200/60 hover:text-[#111827] dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                        Assigned Vehicle
                        <input
                          type="text"
                          value={editVehicle}
                          onChange={(e) => setEditVehicle(e.target.value)}
                          className={fieldCls}
                        />
                      </label>
                      <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                        License Plate
                        <input
                          type="text"
                          value={editPlate}
                          onChange={(e) => setEditPlate(e.target.value)}
                          className={fieldCls}
                        />
                      </label>
                      <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                        Corridor Traffic
                        <select
                          value={editTraffic}
                          onChange={(e) => setEditTraffic(e.target.value as TrafficLevel)}
                          className={fieldCls}
                        >
                          <option value="clear">Clear (1.0x ETA)</option>
                          <option value="moderate">Moderate (+35% ETA)</option>
                          <option value="heavy">Heavy Congestion (+85% ETA)</option>
                        </select>
                      </label>
                      <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                        Driver Name
                        <input
                          type="text"
                          value={editDriver}
                          onChange={(e) => setEditDriver(e.target.value)}
                          className={fieldCls}
                        />
                      </label>
                      <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                        Driver Status
                        <select
                          value={editDriverStatus}
                          onChange={(e) => setEditDriverStatus(e.target.value as DriverStatus)}
                          className={fieldCls}
                        >
                          <option value="en_route">En Route · Hands-Free</option>
                          <option value="at_stop">At Scheduled Stop</option>
                          <option value="standby">Depot Standby</option>
                          <option value="attention">Needs Dispatch Callback</option>
                        </select>
                      </label>
                      <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                        Transport Attendant
                        <input
                          type="text"
                          value={editAttendant}
                          onChange={(e) => setEditAttendant(e.target.value)}
                          className={fieldCls}
                        />
                      </label>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(route.id)}
                        className="btn-spring btn-obsidian gleam-sweep min-h-[40px] rounded-full px-5 py-2 text-xs font-semibold"
                      >
                        Save Assignment Changes
                      </button>
                    </div>
                  </div>
                ) : (
                  <RouteDefinitionCard
                    route={route}
                    assignedStudentCount={assignedCount}
                    onTrafficChange={(nextLevel) =>
                      onUpdateRoute(route.id, { trafficLevel: nextLevel })
                    }
                    onEdit={() => handleStartEdit(route)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Two-Column Creation Panel: Create New Route + Enroll Student on Route */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Create New Route Form */}
        <section
          aria-label="Create new transport route"
          className="glass-card rounded-[24px] p-6"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111827] text-white dark:bg-white dark:text-[#111827]">
              <Plus className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-[#111827] dark:text-white">
                Create Route &amp; Assign Vehicle
              </h2>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                New routes join the live GPS corridor map and attendant handover system.
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateRouteSubmit} className="mt-5 space-y-3.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                Route Name
                <input
                  type="text"
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  placeholder="e.g. Eastwood Express"
                  className={fieldCls}
                />
              </label>
              <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                Route Code
                <input
                  type="text"
                  value={routeCode}
                  onChange={(e) => setRouteCode(e.target.value)}
                  placeholder="e.g. EW-15"
                  className={fieldCls}
                />
              </label>
              <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                Vehicle Label
                <input
                  type="text"
                  value={vehicleLabel}
                  onChange={(e) => setVehicleLabel(e.target.value)}
                  placeholder="e.g. Bus 15"
                  className={fieldCls}
                />
              </label>
              <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                Plate Number
                <input
                  type="text"
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value)}
                  placeholder="e.g. KDL 515E"
                  className={fieldCls}
                />
              </label>
              <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                Assigned Driver
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder="e.g. Josephine Wairimu"
                  className={fieldCls}
                />
              </label>
              <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                Assigned Attendant
                <input
                  type="text"
                  value={attendantName}
                  onChange={(e) => setAttendantName(e.target.value)}
                  placeholder="e.g. Mercy Njeri"
                  className={fieldCls}
                />
              </label>
              <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                Pickup Stop 1
                <input
                  type="text"
                  value={firstStopName}
                  onChange={(e) => setFirstStopName(e.target.value)}
                  placeholder="e.g. Eastwood Gate"
                  className={fieldCls}
                />
              </label>
              <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                Pickup Stop 2
                <input
                  type="text"
                  value={secondStopName}
                  onChange={(e) => setSecondStopName(e.target.value)}
                  placeholder="e.g. Crestview Plaza"
                  className={fieldCls}
                />
              </label>
              <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                Corridor Sector
                <select
                  value={corridorSector}
                  onChange={(e) =>
                    setCorridorSector(
                      e.target.value as 'northeast' | 'northwest' | 'southeast'
                    )
                  }
                  className={fieldCls}
                >
                  <option value="northeast">Northeast (Eastwood)</option>
                  <option value="northwest">Northwest (Pinecrest)</option>
                  <option value="southeast">Southeast (Brookside)</option>
                </select>
              </label>
              <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                Initial Traffic Condition
                <select
                  value={trafficLevel}
                  onChange={(e) => setTrafficLevel(e.target.value as TrafficLevel)}
                  className={fieldCls}
                >
                  <option value="clear">Clear</option>
                  <option value="moderate">Moderate</option>
                  <option value="heavy">Heavy</option>
                </select>
              </label>
            </div>

            {routeError && (
              <p role="alert" className="text-xs font-semibold text-red-600 dark:text-red-400">
                {routeError}
              </p>
            )}
            {routeFeedback && (
              <p className="text-xs font-semibold text-[#10B981] dark:text-emerald-400">
                {routeFeedback}
              </p>
            )}

            <button
              type="submit"
              className="btn-spring btn-obsidian gleam-sweep min-h-[42px] w-full rounded-full px-5 py-2.5 text-xs font-semibold"
            >
              Create Route &amp; Launch GPS Tracking
            </button>
          </form>
        </section>

        {/* Manage Student Enrollment Per Route */}
        <section
          aria-label="Enroll student on transport route"
          className="glass-card rounded-[24px] p-6"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111827] text-white dark:bg-white dark:text-[#111827]">
              <UserPlus className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-[#111827] dark:text-white">
                Add Student to Route &amp; Issue QR Pass
              </h2>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                Automatically issues a route-scoped QR pass and guardian verification record.
              </p>
            </div>
          </div>

          <form onSubmit={handleAddStudentSubmit} className="mt-5 space-y-3.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                Student First Name
                <input
                  type="text"
                  value={stuFirst}
                  onChange={(e) => setStuFirst(e.target.value)}
                  placeholder="e.g. Tariq"
                  className={fieldCls}
                />
              </label>
              <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                Student Last Name
                <input
                  type="text"
                  value={stuLast}
                  onChange={(e) => setStuLast(e.target.value)}
                  placeholder="e.g. Ndegwa"
                  className={fieldCls}
                />
              </label>
              <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                Grade
                <select
                  value={stuGrade}
                  onChange={(e) => setStuGrade(e.target.value)}
                  className={fieldCls}
                >
                  {['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'].map(
                    (g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    )
                  )}
                </select>
              </label>
              <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                Assigned Route
                <select
                  value={stuRouteId}
                  onChange={(e) => handleRouteSelectForStudent(e.target.value)}
                  className={fieldCls}
                >
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.vehicleLabel} · {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-[#64748B] sm:col-span-2 dark:text-slate-400">
                Pickup / Drop-Off Stop
                <select
                  value={stuStopId}
                  onChange={(e) => setStuStopId(e.target.value)}
                  className={fieldCls}
                >
                  {nonCampusStops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.neighborhood})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                Primary Guardian
                <input
                  type="text"
                  value={stuGuardian}
                  onChange={(e) => setStuGuardian(e.target.value)}
                  placeholder="e.g. Grace Ndegwa"
                  className={fieldCls}
                />
              </label>
              <label className="block text-xs font-medium text-[#64748B] dark:text-slate-400">
                Authorized Backup Guardian
                <input
                  type="text"
                  value={stuBackup}
                  onChange={(e) => setStuBackup(e.target.value)}
                  placeholder="e.g. David Ndegwa"
                  className={fieldCls}
                />
              </label>
            </div>

            {studentError && (
              <p role="alert" className="text-xs font-semibold text-red-600 dark:text-red-400">
                {studentError}
              </p>
            )}
            {studentFeedback && (
              <p className="text-xs font-semibold text-[#10B981] dark:text-emerald-400">
                {studentFeedback}
              </p>
            )}

            <button
              type="submit"
              className="btn-spring btn-obsidian gleam-sweep min-h-[42px] w-full rounded-full px-5 py-2.5 text-xs font-semibold"
            >
              Add Student to Route Roster
            </button>
          </form>

          {/* Quick Reassign / Remove Strip */}
          <div className="mt-5 border-t border-gray-200/70 pt-4 dark:border-white/10">
            <p className="text-xs font-bold text-[#111827] dark:text-white">
              Quick Route Assignment ({students.length} enrolled)
            </p>
            <ul className="mt-2.5 max-h-48 divide-y divide-gray-200/60 overflow-y-auto dark:divide-white/10">
              {students.map((stu) => (
                <li
                  key={stu.id}
                  className="flex items-center justify-between gap-2 py-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-[#111827] dark:text-white">
                      {stu.firstName} {stu.lastName}
                    </span>
                    <span className="font-mono-tabular ml-1.5 text-[11px] text-[#64748B] dark:text-slate-400">
                      {stu.qrCodeId}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <select
                      aria-label={`Reassign route for ${stu.firstName} ${stu.lastName}`}
                      value={stu.routeId}
                      onChange={(e) => {
                        const targetRoute = routes.find((r) => r.id === e.target.value);
                        const firstStop = targetRoute?.stops.find((s) => !s.isSchoolCampus);
                        if (targetRoute && firstStop) {
                          onReassignStudent(stu.id, targetRoute.id, firstStop.id);
                        }
                      }}
                      className="h-7 rounded-full border border-gray-200 bg-white/90 px-2.5 text-[11px] font-semibold text-[#111827] focus:border-[#111827] focus:outline-none dark:border-white/15 dark:bg-slate-900 dark:text-white"
                    >
                      {routes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.vehicleLabel}
                        </option>
                      ))}
                    </select>
                    {stu.id !== 'stu-01' && (
                      <button
                        type="button"
                        onClick={() => onRemoveStudent(stu.id)}
                        aria-label={`Remove ${stu.firstName} ${stu.lastName} from transport roster`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#64748B] transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
};
