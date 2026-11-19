import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Database,
  Layers,
  Lock,
  Milestone,
  RefreshCw,
  Server,
  Sliders,
} from 'lucide-react';
import {
  ARCHITECTURE_LAYERS,
  calculateProductionEstimate,
  DEFAULT_DECISION_SELECTIONS,
  OPEN_DECISIONS,
  PILOT_SUCCESS_METRICS,
  RBAC_VISIBILITY_MATRIX,
  ROADMAP_STAGES,
} from '../data/blueprintData';

interface LiveBackendSpec {
  health: {
    status: string;
    service: string;
    version: string;
    shift: string;
    clockLabel: string;
    activeRoutes: number;
    enrolledStudents: number;
    unresolvedAlerts: number;
    auditIntegrity: {
      valid: boolean;
      entryCount: number;
      headHash: string;
    };
  };
  postgresPostgisSchema: string;
  improvementRecommendations: Array<{
    id: string;
    priority: string;
    domain: string;
    title: string;
    problemStatement: string;
    proposedArchitecture: string;
    measurableImpact: string;
  }>;
  endpoints: Array<{
    method: string;
    path: string;
    description: string;
  }>;
}

export const ProductionBlueprint: React.FC = () => {
  const [section, setSection] = useState<
    'roadmap' | 'decisions' | 'architecture' | 'backend'
  >('roadmap');
  const [selectedStageId, setSelectedStageId] = useState<string>(ROADMAP_STAGES[0].id);
  const [decisions, setDecisions] = useState<Record<string, string>>(
    DEFAULT_DECISION_SELECTIONS
  );
  const [completedGates, setCompletedGates] = useState<Record<string, boolean>>({
    'stage-0-1': true, // Synthetic-only dev policy active in this prototype
  });
  const [backendSpec, setBackendSpec] = useState<LiveBackendSpec | null>(null);
  const [probeOutput, setProbeOutput] = useState<string>('');
  const [probeLabel, setProbeLabel] = useState<string>(
    'GET /api/v1/routes/route-04/eta'
  );
  const [isProbing, setIsProbing] = useState(false);

  const loadBackendSpec = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/architecture/infrastructure');
      if (res.ok) {
        const data = (await res.json()) as LiveBackendSpec;
        setBackendSpec(data);
      }
    } catch {
      // ignore if offline
    }
  }, []);

  useEffect(() => {
    loadBackendSpec();
  }, [loadBackendSpec]);

  const runLiveApiProbe = async (
    label: string,
    path: string,
    options?: RequestInit
  ) => {
    setIsProbing(true);
    setProbeLabel(label);
    try {
      const res = await fetch(path, options);
      const json = await res.json();
      setProbeOutput(JSON.stringify(json, null, 2));
      loadBackendSpec();
    } catch (err) {
      setProbeOutput(JSON.stringify({ error: String(err) }, null, 2));
    } finally {
      setIsProbing(false);
    }
  };

  const estimate = useMemo(() => calculateProductionEstimate(decisions), [decisions]);
  const activeStage =
    ROADMAP_STAGES.find((s) => s.id === selectedStageId) ?? ROADMAP_STAGES[0];

  const totalGateCount = ROADMAP_STAGES.reduce(
    (sum, st) => sum + st.productionGates.length,
    0
  );
  const checkedGateCount = Object.values(completedGates).filter(Boolean).length;

  const toggleGate = (key: string) => {
    setCompletedGates((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-6">
      {/* Header + Capsule Sub-Section Switcher */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B] dark:text-slate-400">
            Engineering &amp; Safeguarding Blueprint · Prototype to Production Scale
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#111827] dark:text-white">
            Production Roadmap &amp; System Architecture
          </h1>
        </div>

        <div
          role="tablist"
          aria-label="Blueprint sections"
          className="glass-card inline-flex flex-wrap rounded-full p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={section === 'roadmap'}
            onClick={() => setSection('roadmap')}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
              section === 'roadmap'
                ? 'bg-[#111827] text-white shadow-sm dark:bg-white dark:text-[#111827]'
                : 'text-[#64748B] hover:text-[#111827] dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Milestone className="h-3.5 w-3.5" aria-hidden="true" />
            <span>7-Stage Roadmap</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === 'decisions'}
            onClick={() => setSection('decisions')}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
              section === 'decisions'
                ? 'bg-[#111827] text-white shadow-sm dark:bg-white dark:text-[#111827]'
                : 'text-[#64748B] hover:text-[#111827] dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Open Decisions (7)</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === 'architecture'}
            onClick={() => setSection('architecture')}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
              section === 'architecture'
                ? 'bg-[#111827] text-white shadow-sm dark:bg-white dark:text-[#111827]'
                : 'text-[#64748B] hover:text-[#111827] dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Architecture &amp; Privacy</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === 'backend'}
            onClick={() => setSection('backend')}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
              section === 'backend'
                ? 'bg-[#111827] text-white shadow-sm dark:bg-white dark:text-[#111827]'
                : 'text-[#64748B] hover:text-[#111827] dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Server className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Backend API &amp; Improvements</span>
          </button>
        </div>
      </div>

      {/* Live Dynamic Estimate Strip (4-Col Executive Monochrome KPI Grid) */}
      <div
        data-testid="blueprint-estimate-strip"
        className="grid grid-cols-2 gap-4 sm:grid-cols-4"
      >
        <div className="glass-card-dark rounded-[22px] p-5 text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">
            Estimated MVP Timeline
          </p>
          <p
            data-testid="estimate-weeks"
            className="font-mono-tabular mt-2 text-3xl font-extrabold tracking-tight text-white"
          >
            {estimate.totalWeeksMin}–{estimate.totalWeeksMax} wks
          </p>
          <p className="mt-1.5 text-xs text-slate-300">
            ~{Math.round(estimate.totalWeeksMin / 4.3)}–{Math.round(estimate.totalWeeksMax / 4.3)} months to pilot
          </p>
        </div>

        <div className="glass-card rounded-[22px] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748B] dark:text-slate-400">
            Estimated Build Budget
          </p>
          <p
            data-testid="estimate-cost"
            className="font-mono-tabular mt-2 text-3xl font-extrabold tracking-tight text-[#111827] dark:text-white"
          >
            ${estimate.buildCostMinK}k–${estimate.buildCostMaxK}k
          </p>
          <p className="mt-1.5 text-xs text-[#64748B] dark:text-slate-400">
            Focused team + AI-assisted velocity
          </p>
        </div>

        <div className="glass-card rounded-[22px] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748B] dark:text-slate-400">
            Variable Ops / Bus / Mo
          </p>
          <p
            data-testid="estimate-ops"
            className="font-mono-tabular mt-2 text-3xl font-extrabold tracking-tight text-[#111827] dark:text-white"
          >
            ${estimate.monthlyOpsPerBusUsd}/mo
          </p>
          <p className="mt-1.5 text-xs text-[#64748B] dark:text-slate-400">
            Telemetry, Maps ETA, Push/SMS &amp; DB
          </p>
        </div>

        <div className="glass-card rounded-[22px] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748B] dark:text-slate-400">
            Production Exit Gates
          </p>
          <p className="font-mono-tabular mt-2 text-3xl font-extrabold tracking-tight text-[#10B981]">
            {checkedGateCount}/{totalGateCount}
          </p>
          <p className="mt-1.5 text-xs text-[#64748B] dark:text-slate-400">
            Safeguarding &amp; reliability checks cleared
          </p>
        </div>
      </div>

      {/* SECTION 1: 7-Stage Production Roadmap */}
      {section === 'roadmap' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left 4 cols: Stage List */}
          <nav
            aria-label="Production stages"
            className="glass-card rounded-[24px] p-3 lg:col-span-4"
          >
            <ul className="space-y-1.5">
              {ROADMAP_STAGES.map((stage) => {
                const isActive = stage.id === activeStage.id;
                const stageGatesDone = stage.productionGates.filter(
                  (_, idx) => completedGates[`${stage.id}-${idx}`]
                ).length;

                return (
                  <li key={stage.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedStageId(stage.id)}
                      className={`w-full rounded-2xl px-4 py-3 text-left transition-all ${
                        isActive
                          ? 'bg-[#111827] text-white shadow-sm dark:bg-white dark:text-[#111827]'
                          : 'text-[#374151] hover:bg-white/80 dark:text-slate-300 dark:hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span
                          className={`font-bold ${
                            isActive
                              ? 'text-slate-200 dark:text-slate-600'
                              : 'text-[#64748B] dark:text-slate-400'
                          }`}
                        >
                          {stage.stageNumber} · {stage.phaseLabel}
                        </span>
                        <span
                          className={`font-mono-tabular text-[11px] ${
                            isActive
                              ? 'text-slate-300 dark:text-slate-600'
                              : 'text-[#64748B] dark:text-slate-400'
                          }`}
                        >
                          {stage.durationWeeks}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-bold leading-snug">
                        {stage.title}
                      </p>
                      <p
                        className={`mt-1 text-[11px] tabular-nums ${
                          isActive
                            ? 'text-slate-300 dark:text-slate-600'
                            : 'text-[#64748B] dark:text-slate-400'
                        }`}
                      >
                        Gates cleared: {stageGatesDone}/{stage.productionGates.length} ·{' '}
                        {stage.budgetBand}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Right 8 cols: Active Stage Deep-Dive */}
          <article
            aria-label={`${activeStage.stageNumber} details`}
            className="glass-card rounded-[24px] p-6 lg:col-span-8"
          >
            <div className="border-b border-gray-200/70 pb-5 dark:border-white/10">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B] dark:text-slate-400">
                <span className="rounded-full bg-[#111827] px-2.5 py-0.5 font-bold text-white dark:bg-white dark:text-[#111827]">
                  {activeStage.stageNumber}
                </span>
                <span className="font-semibold text-[#111827] dark:text-white">
                  {activeStage.phaseLabel}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">{activeStage.durationWeeks}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">{activeStage.budgetBand}</span>
              </div>
              <h2 className="mt-2 text-xl font-extrabold tracking-tight text-[#111827] dark:text-white">
                {activeStage.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5563] dark:text-slate-300">
                {activeStage.objective}
              </p>
              <p className="mt-2.5 text-xs text-[#64748B] dark:text-slate-400">
                Recommended Team:{' '}
                <span className="font-semibold text-[#111827] dark:text-white">
                  {activeStage.teamProfile}
                </span>
              </p>
            </div>

            <div className="mt-6 space-y-6">
              {/* Deliverables */}
              <div>
                <h3 className="text-sm font-bold text-[#111827] dark:text-white">
                  Core Engineering &amp; Product Deliverables
                </h3>
                <ul className="mt-3 space-y-2.5 text-sm text-[#374151] dark:text-slate-300">
                  {activeStage.deliverables.map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#111827] dark:bg-white"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Interactive Production Readiness Gates */}
              <div className="border-t border-gray-200/70 pt-5 dark:border-white/10">
                <h3 className="text-sm font-bold text-[#111827] dark:text-white">
                  Non-Negotiable Production Exit Gates
                </h3>
                <p className="mt-0.5 text-xs text-[#64748B] dark:text-slate-400">
                  Check off gates as your team validates them to track readiness toward a real school pilot.
                </p>
                <ul className="mt-3 space-y-2">
                  {activeStage.productionGates.map((gate, idx) => {
                    const key = `${activeStage.id}-${idx}`;
                    const checked = Boolean(completedGates[key]);
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => toggleGate(key)}
                          className="glass-subcard flex min-h-[44px] w-full items-start gap-3 rounded-2xl px-4 py-3 text-left text-xs transition-all hover:border-[#111827] hover:bg-white dark:hover:border-white/30 dark:hover:bg-white/10"
                        >
                          {checked ? (
                            <CheckCircle2
                              className="mt-0.5 h-4 w-4 shrink-0 text-[#10B981]"
                              aria-hidden="true"
                            />
                          ) : (
                            <Circle
                              className="mt-0.5 h-4 w-4 shrink-0 text-[#9CA3AF] dark:text-slate-600"
                              aria-hidden="true"
                            />
                          )}
                          <span
                            className={
                              checked
                                ? 'text-[#64748B] line-through dark:text-slate-400'
                                : 'font-medium text-[#111827] dark:text-slate-100'
                            }
                          >
                            {gate}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Risks & Mitigations */}
              <div className="border-t border-gray-200/70 pt-5 dark:border-white/10">
                <h3 className="text-sm font-bold text-[#111827] dark:text-white">
                  Key Risks &amp; Mitigations
                </h3>
                <ul className="mt-2.5 space-y-2 text-xs leading-relaxed text-[#4B5563] dark:text-slate-300">
                  {activeStage.risksAndMitigations.map((risk) => (
                    <li key={risk} className="flex items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                      />
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </article>
        </div>
      )}

      {/* SECTION 2: 7 Critical Open Decisions Interactive Matrix */}
      {section === 'decisions' && (
        <div className="space-y-4">
          <div className="glass-card rounded-[24px] p-5">
            <h2 className="text-sm font-bold text-[#111827] dark:text-white">
              Lock Your v1 Architectural Decisions
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[#64748B] dark:text-slate-400">
              Select a provisional v1 decision below. The timeline, build budget, and monthly per-bus
              operating cost strip above automatically recalculates based on your choices.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {OPEN_DECISIONS.map((decision) => {
              const selectedId = decisions[decision.id];
              return (
                <section
                  key={decision.id}
                  aria-label={decision.title}
                  className="glass-card rounded-[24px] p-5"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono-tabular text-xs font-bold text-[#111827] dark:text-white">
                      {decision.number}.
                    </span>
                    <h3 className="text-sm font-bold text-[#111827] dark:text-white">
                      {decision.title}
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-[#64748B] dark:text-slate-400">
                    {decision.whyItMatters}
                  </p>

                  <div className="mt-3.5 space-y-2.5" role="radiogroup" aria-label={decision.title}>
                    {decision.options.map((opt) => {
                      const isChecked = selectedId === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="radio"
                          aria-checked={isChecked}
                          onClick={() =>
                            setDecisions((prev) => ({ ...prev, [decision.id]: opt.id }))
                          }
                          className={`w-full rounded-2xl p-3.5 text-left transition-all ${
                            isChecked
                              ? 'border-2 border-[#111827] bg-white/95 shadow-sm dark:border-white dark:bg-white/10'
                              : 'glass-subcard hover:bg-white/90 dark:hover:bg-white/10'
                          }`}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs font-bold text-[#111827] dark:text-white">
                              {opt.label}
                            </span>
                            <span className="font-mono-tabular shrink-0 text-[11px] font-semibold text-[#64748B] dark:text-slate-400">
                              +{opt.weeksDelta}w · +${opt.monthlyOpsPerBusUsd}/bus
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-[#4B5563] dark:text-slate-300">
                            {opt.summary}
                          </p>
                          <p className="mt-1 text-[11px] text-[#64748B] dark:text-slate-400">
                            Safeguarding note: {opt.safetyNote}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 3: Architecture Stack, Visibility Without Exposure RBAC & Success Metrics */}
      {section === 'architecture' && (
        <div className="space-y-6">
          {/* 4-Layer System Architecture */}
          <section
            aria-label="Production system architecture"
            className="glass-card rounded-[24px] p-6"
          >
            <h2 className="text-sm font-bold text-[#111827] dark:text-white">
              Production Architecture Stack (Event-Driven, Multi-Tenant)
            </h2>
            <p className="mt-1 text-xs text-[#64748B] dark:text-slate-400">
              Decoupled tracking ingestion, geospatial state machine, and role-scoped family visibility.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              {ARCHITECTURE_LAYERS.map((layer) => (
                <div
                  key={layer.id}
                  className="glass-subcard rounded-2xl p-4"
                >
                  <p className="text-sm font-bold text-[#111827] dark:text-white">
                    {layer.layer}
                  </p>
                  <p className="mt-1 font-mono-tabular text-xs font-semibold text-[#374151] dark:text-slate-200">
                    {layer.stack}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-[#64748B] dark:text-slate-400">
                    {layer.responsibility}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Visibility Without Exposure RBAC Matrix */}
          <section
            aria-label="Role-based data visibility matrix"
            className="glass-card overflow-hidden rounded-[24px]"
          >
            <div className="flex items-center gap-3 border-b border-gray-200/70 px-6 py-4 dark:border-white/10">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111827] text-white dark:bg-white dark:text-[#111827]">
                <Lock className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-[#111827] dark:text-white">
                  Visibility Without Exposure — RBAC Isolation Matrix
                </h2>
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  Strict least-privilege scoping enforced at the PostgreSQL RLS &amp; API projection layer.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-200/70 bg-gray-50/70 text-[11px] uppercase tracking-wider text-[#64748B] dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                    <th className="px-5 py-3 font-semibold">Sensitive Data Surface</th>
                    <th className="px-4 py-3 font-semibold">Parent</th>
                    <th className="px-4 py-3 font-semibold">Driver</th>
                    <th className="px-4 py-3 font-semibold">Attendant</th>
                    <th className="px-4 py-3 font-semibold">School Admin</th>
                    <th className="px-5 py-3 font-semibold">Platform Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200/60 dark:divide-white/10">
                  {RBAC_VISIBILITY_MATRIX.map((row) => (
                    <tr
                      key={row.capability}
                      className="transition-colors hover:bg-white/70 dark:hover:bg-white/5"
                    >
                      <td className="px-5 py-3.5 font-semibold text-[#111827] dark:text-white">
                        {row.capability}
                      </td>
                      <td className="px-4 py-3.5 text-[#374151] dark:text-slate-300">
                        {row.parent}
                      </td>
                      <td className="px-4 py-3.5 text-[#374151] dark:text-slate-300">
                        {row.driver}
                      </td>
                      <td className="px-4 py-3.5 text-[#374151] dark:text-slate-300">
                        {row.attendant}
                      </td>
                      <td className="px-4 py-3.5 text-[#374151] dark:text-slate-300">
                        {row.schoolAdmin}
                      </td>
                      <td className="px-5 py-3.5 text-[#374151] dark:text-slate-300">
                        {row.platformAdmin}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Pilot Success Metrics */}
          <section
            aria-label="Pilot success metrics"
            className="glass-card overflow-hidden rounded-[24px]"
          >
            <div className="border-b border-gray-200/70 px-6 py-4 dark:border-white/10">
              <h2 className="text-sm font-bold text-[#111827] dark:text-white">
                What Success Looks Like — Controlled School Pilot Targets
              </h2>
              <p className="text-xs text-[#64748B] dark:text-slate-400">
                Human-centered outcomes measured before scaling beyond the first partner school.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-200/70 bg-gray-50/70 text-[11px] uppercase tracking-wider text-[#64748B] dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                    <th className="px-5 py-3 font-semibold">Outcome Metric</th>
                    <th className="px-4 py-3 font-semibold">Pilot Target</th>
                    <th className="px-5 py-3 font-semibold">How Measured</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200/60 dark:divide-white/10">
                  {PILOT_SUCCESS_METRICS.map((item) => (
                    <tr
                      key={item.metric}
                      className="transition-colors hover:bg-white/70 dark:hover:bg-white/5"
                    >
                      <td className="px-5 py-3.5 font-semibold text-[#111827] dark:text-white">
                        {item.metric}
                      </td>
                      <td className="font-mono-tabular px-4 py-3.5 font-bold text-[#10B981]">
                        {item.target}
                      </td>
                      <td className="px-5 py-3.5 text-[#4B5563] dark:text-slate-300">
                        {item.measurement}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* SECTION 4: Live Backend Infrastructure, PostGIS RLS Schema & Engineering Improvements */}
      {section === 'backend' && (
        <div className="space-y-6">
          {/* Live Express Backend Telemetry & SHA-256 Hash-Chain Status */}
          <section
            aria-label="Live backend API console"
            className="glass-card rounded-[24px] p-6"
          >
            <div className="flex flex-col gap-3 border-b border-gray-200/70 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#10B981]" />
                  <h2 className="text-sm font-bold text-[#111827] dark:text-white">
                    Live Backend API Engine (/api/v1/*) &amp; SHA-256 Audit Ledger
                  </h2>
                </div>
                <p className="mt-1 text-xs text-[#64748B] dark:text-slate-400">
                  Server-authoritative Express telemetry API enforcing parent RBAC isolation, traffic-weighted ETAs, and tamper-evident handover hashing.
                </p>
              </div>

              {backendSpec?.health && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono-tabular rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    Audit Chain:{' '}
                    {backendSpec.health.auditIntegrity.valid ? 'VERIFIED' : 'INVALID'} · #
                    {backendSpec.health.auditIntegrity.headHash}
                  </span>
                </div>
              )}
            </div>

            {/* Interactive Endpoint Probes */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  runLiveApiProbe(
                    'GET /api/v1/health',
                    '/api/v1/health'
                  )
                }
                className="btn-spring glass-subcard rounded-full px-3.5 py-1.5 text-xs font-semibold text-[#111827] hover:border-[#111827] hover:bg-white dark:text-white"
              >
                Probe Health &amp; Weights
              </button>
              <button
                type="button"
                onClick={() =>
                  runLiveApiProbe(
                    'GET /api/v1/routes/route-04/eta',
                    '/api/v1/routes/route-04/eta'
                  )
                }
                className="btn-spring glass-subcard rounded-full px-3.5 py-1.5 text-xs font-semibold text-[#111827] hover:border-[#111827] hover:bg-white dark:text-white"
              >
                Probe Weighted Stop ETAs (Bus 04)
              </button>
              <button
                type="button"
                onClick={() =>
                  runLiveApiProbe(
                    'GET /api/v1/parent/snapshot/stu-01 (RBAC Scoped)',
                    '/api/v1/parent/snapshot/stu-01',
                    { headers: { 'x-safari-role': 'parent' } }
                  )
                }
                className="btn-spring glass-subcard rounded-full px-3.5 py-1.5 text-xs font-semibold text-[#111827] hover:border-[#111827] hover:bg-white dark:text-white"
              >
                Probe Parent RBAC Snapshot
              </button>
              <button
                type="button"
                onClick={() =>
                  runLiveApiProbe(
                    'GET /api/v1/fleet/snapshot (As Parent → Expect 403)',
                    '/api/v1/fleet/snapshot',
                    { headers: { 'x-safari-role': 'parent' } }
                  )
                }
                className="btn-spring glass-subcard rounded-full px-3.5 py-1.5 text-xs font-semibold text-[#111827] hover:border-[#111827] hover:bg-white dark:text-white"
              >
                Test Parent Boundary Guard (403)
              </button>
            </div>

            {probeOutput && (
              <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200/80 bg-[#111827] p-4 text-xs text-slate-100 dark:border-white/10">
                <div className="flex items-center justify-between border-b border-white/10 pb-2 text-[11px] text-slate-400">
                  <span className="font-mono-tabular font-semibold text-emerald-400">
                    {probeLabel}
                  </span>
                  {isProbing && (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" />
                  )}
                </div>
                <pre
                  data-testid="backend-probe-output"
                  className="font-mono-tabular mt-2 max-h-60 overflow-auto text-[11px] leading-relaxed"
                >
                  {probeOutput}
                </pre>
              </div>
            )}

            {/* REST Endpoint Directory */}
            {backendSpec?.endpoints && (
              <div className="mt-5 grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {backendSpec.endpoints.map((ep) => (
                  <div
                    key={`${ep.method}-${ep.path}`}
                    className="glass-subcard rounded-2xl p-3.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono-tabular rounded-md bg-[#111827] px-2 py-0.5 text-[10px] font-bold text-white dark:bg-white dark:text-[#111827]">
                        {ep.method}
                      </span>
                      <span className="font-mono-tabular text-xs font-bold text-[#111827] dark:text-white">
                        {ep.path}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-[#64748B] dark:text-slate-400">
                      {ep.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Advanced Engineering Improvement Proposals */}
          <section
            aria-label="Engineering improvement recommendations"
            className="glass-card rounded-[24px] p-6"
          >
            <h2 className="text-sm font-bold text-[#111827] dark:text-white">
              Deep-Research Architectural Improvement Proposals (v2 Scale Roadmap)
            </h2>
            <p className="mt-1 text-xs text-[#64748B] dark:text-slate-400">
              High-leverage engineering upgrades prioritized across Kalman-filtered ETA kinematics, cryptographic student safeguarding, and cellular dead-zone resilience.
            </p>

            <div className="mt-4 space-y-3.5">
              {(backendSpec?.improvementRecommendations ?? []).map((rec) => (
                <article
                  key={rec.id}
                  data-testid={`backend-improvement-${rec.id}`}
                  className="glass-subcard rounded-2xl p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono-tabular rounded-full bg-[#111827] px-2.5 py-0.5 text-[11px] font-bold text-white dark:bg-white dark:text-[#111827]">
                        {rec.priority}
                      </span>
                      <span className="text-xs font-semibold text-[#64748B] dark:text-slate-400">
                        {rec.domain}
                      </span>
                    </div>
                    <span className="font-mono-tabular text-xs font-bold text-[#10B981]">
                      Impact: {rec.measurableImpact}
                    </span>
                  </div>

                  <h3 className="mt-2 text-sm font-bold text-[#111827] dark:text-white">
                    {rec.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-[#4B5563] dark:text-slate-300">
                    <span className="font-semibold text-[#111827] dark:text-white">
                      Bottleneck:{' '}
                    </span>
                    {rec.problemStatement}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#4B5563] dark:text-slate-300">
                    <span className="font-semibold text-[#111827] dark:text-white">
                      Proposed Design:{' '}
                    </span>
                    {rec.proposedArchitecture}
                  </p>
                </article>
              ))}
            </div>
          </section>

          {/* Production PostgreSQL 16 + PostGIS + Row-Level Security DDL */}
          {backendSpec?.postgresPostgisSchema && (
            <section
              aria-label="PostgreSQL PostGIS production schema"
              className="glass-card rounded-[24px] p-6"
            >
              <div className="flex items-center gap-2.5">
                <Database className="h-4 w-4 text-[#111827] dark:text-white" />
                <h2 className="text-sm font-bold text-[#111827] dark:text-white">
                  PostgreSQL 16 + PostGIS 3.4 + Row-Level Security (RLS) Production Schema
                </h2>
              </div>
              <pre className="font-mono-tabular mt-3 max-h-80 overflow-auto rounded-2xl bg-[#111827] p-4 text-[11px] leading-relaxed text-slate-200">
                {backendSpec.postgresPostgisSchema}
              </pre>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
