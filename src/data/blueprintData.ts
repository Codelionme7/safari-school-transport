import { OpenDecision, RoadmapStage } from '../types/safari';

export const OPEN_DECISIONS: OpenDecision[] = [
  {
    id: 'market',
    number: '01',
    title: 'Primary Market & Privacy Regime',
    question: 'Which legal and connectivity environment shapes v1 compliance?',
    whyItMatters:
      'Determines children’s data-residency rules, guardian consent workflows, SMS fallback importance, and school billing rails.',
    options: [
      {
        id: 'east-africa-pilot',
        label: 'East Africa Private Schools (Recommended v1)',
        summary: 'Kenya DPA / local consent flows, resilient cellular + SMS fallback, school-billed SaaS.',
        weeksDelta: 0,
        buildCostDeltaK: 0,
        monthlyOpsPerBusUsd: 14,
        safetyNote: 'Requires SMS fallback for intermittent 3G/4G corridors and strict guardian ID handover.',
        recommended: true,
      },
      {
        id: 'uk-eu-gdpr',
        label: 'UK / EU Independent Schools (GDPR-K)',
        summary: 'EU data residency, DPIA before pilot, strict 30-day raw GPS purge and DPA agreements.',
        weeksDelta: 3,
        buildCostDeltaK: 8,
        monthlyOpsPerBusUsd: 22,
        safetyNote: 'Mandates formal Data Protection Impact Assessment (DPIA) and EU regional cloud hosting.',
      },
      {
        id: 'us-ferpa-coppa',
        label: 'North America (FERPA / COPPA)',
        summary: 'District vendor security questionnaires, SOC 2 readiness path, parental consent audit logs.',
        weeksDelta: 4,
        buildCostDeltaK: 12,
        monthlyOpsPerBusUsd: 24,
        safetyNote: 'Requires strict FERPA student directory isolation and zero third-party ad/analytics SDKs.',
      },
    ],
  },
  {
    id: 'device',
    number: '02',
    title: 'Vehicle Telemetry Device Strategy',
    question: 'How does the bus report live GPS coordinates safely?',
    whyItMatters:
      'Drivers must not interact with phones while driving children. Hardware reliability directly governs parent trust.',
    options: [
      {
        id: 'dedicated-gps',
        label: 'Dedicated Hardwired GPS Trackers (Recommended)',
        summary: 'Tamper-resistant OBD/hardwired IoT tracker streaming via MQTT/TCP with battery backup.',
        weeksDelta: 2,
        buildCostDeltaK: 5,
        monthlyOpsPerBusUsd: 16,
        safetyNote: 'Zero driver phone distraction; highest uptime and ignition-state awareness.',
        recommended: true,
      },
      {
        id: 'hybrid-telematics',
        label: 'Hybrid: Existing Fleet Telematics + Companion App',
        summary: 'Ingest school’s existing GPS provider webhook alongside lightweight attendant tablet.',
        weeksDelta: 3,
        buildCostDeltaK: 6,
        monthlyOpsPerBusUsd: 11,
        safetyNote: 'Avoids new hardware capex but depends on third-party telematics refresh cadence (10–30s).',
      },
      {
        id: 'driver-phone',
        label: 'Driver Smartphone Background App (Pilot Only)',
        summary: 'Zero hardware cost for early synthetic tests, subject to OS battery throttling.',
        weeksDelta: 0,
        buildCostDeltaK: 0,
        monthlyOpsPerBusUsd: 6,
        safetyNote: 'Caution: phone battery drain, OS background kills, and temptation for driver screen touch.',
      },
    ],
  },
  {
    id: 'boarding',
    number: '03',
    title: 'Boarding & Drop-Off Confirmation',
    question: 'Should verified boarding be in v1 MVP or phased in with hardware?',
    whyItMatters:
      'Unreliable confirmation is worse than none. A false "boarded" signal breaks trust instantly.',
    options: [
      {
        id: 'attendant-verified',
        label: 'Attendant One-Tap Checklist + Timestamp (Recommended v1.1)',
        summary: 'Dedicated bus attendant confirms boarding/handover on a mounted tablet with audit log.',
        weeksDelta: 2,
        buildCostDeltaK: 4,
        monthlyOpsPerBusUsd: 4,
        safetyNote: 'Keeps driver hands-free; only enabled on routes staffed with a trained attendant.',
        recommended: true,
      },
      {
        id: 'eta-only-mvp',
        label: 'Defer Boarding to Phase 2 (Pure ETA & Live Route MVP)',
        summary: 'Ship rock-solid approaching alerts and school visibility first; add RFID/attendant after pilot.',
        weeksDelta: 0,
        buildCostDeltaK: 0,
        monthlyOpsPerBusUsd: 0,
        safetyNote: 'Fastest path to zero-false-positive reliability; eliminates waiting immediately.',
      },
      {
        id: 'nfc-rfid',
        label: 'NFC / RFID Student Smart Tags at Bus Door',
        summary: 'Automatic tap-on / tap-off card reader mounted at bus entry linked to hardware tracker.',
        weeksDelta: 5,
        buildCostDeltaK: 14,
        monthlyOpsPerBusUsd: 12,
        safetyNote: 'High accuracy at scale, but adds card replacement logistics and hardware integration lead time.',
      },
    ],
  },
  {
    id: 'notifications',
    number: '04',
    title: 'Notification & Fallback Architecture',
    question: 'How do parents receive calm, timely alerts even on weak networks?',
    whyItMatters:
      'Parents standing outside need certainty, not noisy spam. Geofence hysteresis prevents flapping alerts.',
    options: [
      {
        id: 'push-plus-sms',
        label: 'Push (FCM/APNs) + Automatic SMS Fallback (Recommended)',
        summary: 'Configurable 5–10 min geofence trigger, quiet hours, and SMS fallback on push delivery timeout.',
        weeksDelta: 1,
        buildCostDeltaK: 2,
        monthlyOpsPerBusUsd: 10,
        safetyNote: 'Guarantees delivery in low-bandwidth suburban zones where push sockets drop.',
        recommended: true,
      },
      {
        id: 'push-only',
        label: 'Push Notifications Only',
        summary: 'Lower per-message operational cost via FCM/APNs with in-app banner fallback.',
        weeksDelta: 0,
        buildCostDeltaK: 0,
        monthlyOpsPerBusUsd: 2,
        safetyNote: 'Risk of missed approaching alerts when parent phone has weak mobile data.',
      },
    ],
  },
  {
    id: 'parent-client',
    number: '05',
    title: 'Parent Client Delivery',
    question: 'How do families access Safari on day one?',
    whyItMatters:
      'Balances install friction, background push reliability on iOS/Android, and engineering velocity.',
    options: [
      {
        id: 'pwa-plus-native',
        label: 'React Native / Flutter Mobile App + Web Companion (Recommended)',
        summary: 'Single cross-platform mobile codebase for reliable push + React school operations console.',
        weeksDelta: 3,
        buildCostDeltaK: 7,
        monthlyOpsPerBusUsd: 3,
        safetyNote: 'Native push permissions and lock-screen live activities work reliably across iOS & Android.',
        recommended: true,
      },
      {
        id: 'pwa-first',
        label: 'Installable Progressive Web App (PWA) First',
        summary: 'Instant rollout without App Store review cycles; pairs with SMS fallback for iOS.',
        weeksDelta: 0,
        buildCostDeltaK: 0,
        monthlyOpsPerBusUsd: 1,
        safetyNote: 'Fastest pilot launch; iOS web push requires Home Screen installation by parents.',
      },
    ],
  },
  {
    id: 'retention',
    number: '06',
    title: 'Location Data Retention Policy',
    question: 'How long is precise GPS history retained vs anonymized aggregates?',
    whyItMatters:
      'Enforces Visibility Without Exposure by minimizing sensitive movement history of children.',
    options: [
      {
        id: '30-day-purge',
        label: '30-Day Precise History → Auto-Purge to Anonymized Stats (Recommended)',
        summary: 'Retain raw coordinates 30 days for incident review; keep only route-level ETA metrics beyond.',
        weeksDelta: 1,
        buildCostDeltaK: 1,
        monthlyOpsPerBusUsd: 2,
        safetyNote: 'Strongest privacy posture; prevents long-term movement profiling of minors.',
        recommended: true,
      },
      {
        id: 'term-retention',
        label: '90-Day Term Retention + Encrypted Cold Archive',
        summary: 'Aligned to school academic terms with automated key-rotated archival.',
        weeksDelta: 1,
        buildCostDeltaK: 2,
        monthlyOpsPerBusUsd: 4,
        safetyNote: 'Supports full-term transport audits; requires stricter access-review logging.',
      },
    ],
  },
  {
    id: 'commercial',
    number: '07',
    title: 'Commercial & Billing Model',
    question: 'Who pays for Safari and how are schools onboarded?',
    whyItMatters:
      'Aligns incentives so every child on a bus is covered—no safety tiers that exclude families.',
    options: [
      {
        id: 'school-license',
        label: 'B2B School Per-Bus / Per-Student License (Recommended)',
        summary: 'School pays annual/term SaaS fee; all enrolled parents receive core safety visibility free.',
        weeksDelta: 0,
        buildCostDeltaK: 0,
        monthlyOpsPerBusUsd: 0,
        safetyNote: 'Prevents two-tier child safety; schools justify ROI via reduced dispatch calls and parent retention.',
        recommended: true,
      },
      {
        id: 'school-plus-parent-pro',
        label: 'School Base License + Optional Parent Convenience Add-On',
        summary: 'Core safety & ETA funded by school; optional multi-guardian SMS packs or calendar sync.',
        weeksDelta: 2,
        buildCostDeltaK: 3,
        monthlyOpsPerBusUsd: 1,
        safetyNote: 'Adds consumer billing/support overhead; ensure core safety alerts are never paywalled.',
      },
    ],
  },
];

export const DEFAULT_DECISION_SELECTIONS: Record<string, string> = {
  market: 'east-africa-pilot',
  device: 'dedicated-gps',
  boarding: 'attendant-verified',
  notifications: 'push-plus-sms',
  'parent-client': 'pwa-plus-native',
  retention: '30-day-purge',
  commercial: 'school-license',
};

export interface ProductionEstimate {
  totalWeeksMin: number;
  totalWeeksMax: number;
  buildCostMinK: number;
  buildCostMaxK: number;
  monthlyOpsPerBusUsd: number;
  complianceHighlights: string[];
}

export function calculateProductionEstimate(
  selections: Record<string, string>
): ProductionEstimate {
  let weeksDelta = 0;
  let costDeltaK = 0;
  let monthlyOpsPerBusUsd = 12; // Base cloud + PostGIS + Maps ETA API
  const complianceHighlights: string[] = [];

  for (const decision of OPEN_DECISIONS) {
    const selectedId = selections[decision.id];
    const opt =
      decision.options.find((o) => o.id === selectedId) ?? decision.options[0];
    weeksDelta += opt.weeksDelta;
    costDeltaK += opt.buildCostDeltaK;
    monthlyOpsPerBusUsd += opt.monthlyOpsPerBusUsd;
    complianceHighlights.push(`${decision.title}: ${opt.safetyNote}`);
  }

  // Base solid MVP foundation = 14–18 weeks, $24k–$38k (small team / AI-assisted)
  const totalWeeksMin = 14 + weeksDelta;
  const totalWeeksMax = 18 + Math.round(weeksDelta * 1.35);
  const buildCostMinK = 24 + costDeltaK;
  const buildCostMaxK = 38 + Math.round(costDeltaK * 1.45);

  return {
    totalWeeksMin,
    totalWeeksMax,
    buildCostMinK,
    buildCostMaxK,
    monthlyOpsPerBusUsd,
    complianceHighlights,
  };
}

export const ROADMAP_STAGES: RoadmapStage[] = [
  {
    id: 'stage-0',
    stageNumber: 'Stage 0',
    title: 'Lock Decisions, Safeguarding & System Design',
    phaseLabel: 'Foundation',
    durationWeeks: '2–3 weeks',
    teamProfile: 'Founder + Systems Architect + Legal/Privacy Advisor',
    budgetBand: '$2k – $5k',
    objective:
      'Eliminate architectural ambiguity and establish Visibility Without Exposure privacy rules before writing production backend code.',
    deliverables: [
      'Locked v1 Open Decisions Charter (market, hardware, boarding scope, retention)',
      'PostgreSQL + PostGIS multi-tenant schema with Row-Level Security (RLS) by school_id',
      'Journey State Machine specification & exception playbooks (GPS loss, delay, deviation)',
      'School Data Processing Agreement (DPA) and Guardian Consent flow templates',
    ],
    productionGates: [
      'Threat model signed off for minor-PII isolation (no public route endpoints)',
      'Synthetic-only development data policy enforced across all environments',
      'Hardware GPS tracker bench-tested for 48h continuous MQTT/TCP reporting',
    ],
    risksAndMitigations: [
      'Scope creep into full ERP/billing → strictly gate v1 to ETA, visibility, and safe handover',
      'Underestimating legal onboarding → draft school privacy packet during Stage 0, not Stage 5',
    ],
  },
  {
    id: 'stage-1',
    stageNumber: 'Stage 1',
    title: 'Core Multi-Tenant Backend, Auth & RBAC',
    phaseLabel: 'Core Platform',
    durationWeeks: '4–5 weeks',
    teamProfile: '1 Backend Engineer + 1 Full-Stack Engineer',
    budgetBand: '$8k – $14k',
    objective:
      'Build the hardened multi-tenant API, role-scoped authorization layer, route/roster management, and immutable audit logging.',
    deliverables: [
      'Node.js (NestJS/Fastify) or FastAPI service with JWT/OAuth2 + strict RBAC policies',
      'Multi-tenant isolation: Parent sees only linked child/stop; School sees only its fleet',
      'CSV/Admin onboarding pipeline for routes, stops, vehicles, students, and authorized guardians',
      'Automated synthetic vehicle trip simulator for deterministic QA and load testing',
    ],
    productionGates: [
      'Automated RBAC integration tests prove zero cross-school or cross-family data leakage',
      'All sensitive reads/writes recorded in append-only audit_logs table',
      'Encrypted in transit (TLS 1.3) and at rest (KMS-managed Postgres encryption)',
    ],
    risksAndMitigations: [
      'Dirty school roster spreadsheets → build forgiving CSV validator with preview & conflict resolution',
      'Shared guardian accounts → model explicit guardian-to-student authorization relationships',
    ],
  },
  {
    id: 'stage-2',
    stageNumber: 'Stage 2',
    title: 'Real-Time Telemetry Pipeline, Geofencing & ETA Engine',
    phaseLabel: 'Live Engine',
    durationWeeks: '4–6 weeks',
    teamProfile: '1 Backend/Geo Engineer + 1 DevOps Engineer',
    budgetBand: '$10k – $16k',
    objective:
      'Ingest continuous vehicle pings reliably, compute traffic-aware ETAs, evaluate stop geofences, and degrade gracefully during signal drops.',
    deliverables: [
      'Dedicated GPS ingestion worker (MQTT/TCP → Redis Streams → PostGIS trajectory store)',
      'Journey State Machine worker (Not Started → In Progress → Approaching → Completed / Exception)',
      'Stop geofence engine with dwell/hysteresis logic to eliminate duplicate alerts',
      'Event-driven notification fanout (FCM/APNs push + Twilio/Africa’s Talking SMS fallback)',
    ],
    productionGates: [
      'Load tested to 500 concurrent buses at 5-second ping cadence with <800ms fanout p95',
      'Graceful degradation verified: 60s GPS blackout transitions bus to Degraded state without false alerts',
      'ETA median error < 90 seconds across simulated traffic slowdowns',
    ],
    risksAndMitigations: [
      'Maps API cost explosion → cache distance matrices per corridor and snap to route segments',
      'GPS drift triggering false deviations → apply 120m corridor buffer + 2 consecutive off-route readings',
    ],
  },
  {
    id: 'stage-3',
    stageNumber: 'Stage 3',
    title: 'Parent Companion App (Calm, Low-Anxiety UX)',
    phaseLabel: 'Family Experience',
    durationWeeks: '4–5 weeks',
    teamProfile: '1 Mobile Engineer (React Native/Flutter) + 1 Product Designer',
    budgetBand: '$8k – $15k',
    objective:
      'Deliver a glanceable, one-handed parent experience answering "When do I step out?" without clutter or exposure.',
    deliverables: [
      'Home screen with prominent "Step out in ~X min" focal card and Safe Handover timeline',
      'Privacy-scoped live map showing only the assigned vehicle and parent’s stop',
      'Parent preference controls: approaching threshold (3–10 min), quiet hours, SMS fallback',
      'Authorized guardian handover card & calm delay advisory inbox',
    ],
    productionGates: [
      'Cold-start to live ETA render < 1.5s on mid-range Android devices over 3G',
      'WCAG AA daylight contrast verified for outdoor pickup visibility',
      'Offline state clearly displays last confirmed timestamp rather than spinning forever',
    ],
    risksAndMitigations: [
      'Notification fatigue → enforce max 1 approaching alert + 1 handover event + exception alerts per trip',
      'Anxious map-staring → lead with clear next-action copy ("Step out in 6 min") above the map',
    ],
  },
  {
    id: 'stage-4',
    stageNumber: 'Stage 4',
    title: 'School Live Operations Console & Driver/Attendant Flow',
    phaseLabel: 'Operations',
    durationWeeks: '3–5 weeks',
    teamProfile: '1 Frontend Engineer + 1 Mobile Engineer',
    budgetBand: '$7k – $12k',
    objective:
      'Give transport coordinators proactive fleet awareness while keeping drivers strictly hands-free.',
    deliverables: [
      'School Operations Dashboard: live multi-bus map, anomaly inbox, and route roster status',
      'One-click Calm Broadcast tool to notify affected parents on a delayed route',
      'Zero-touch Driver HUD (motion-locked screen when speed > 5 km/h)',
      'Attendant Boarding & Authorized Guardian Drop-Off confirmation tablet flow',
    ],
    productionGates: [
      'Coordinator can identify and notify parents of a delayed bus in < 20 seconds',
      'Driver HUD requires zero manual taps during an entire normal trip',
      'Attendant offline confirmations queue locally and reconcile cleanly on reconnect',
    ],
    risksAndMitigations: [
      'Drivers tapping phones → lock non-emergency interactions above walking speed; rely on hardware GPS',
      'School staff overwhelm → surface only exceptions at top of console; keep nominal buses calm',
    ],
  },
  {
    id: 'stage-5',
    stageNumber: 'Stage 5',
    title: 'Security Hardening, Synthetic Pilot & Safeguarding Review',
    phaseLabel: 'Hardening',
    durationWeeks: '3–4 weeks',
    teamProfile: 'Security Auditor + QA Engineer + Founder',
    budgetBand: '$5k – $10k',
    objective:
      'Validate failure modes, penetration-test multi-tenant isolation, and run a 2-week synthetic shadow pilot before carrying real student records.',
    deliverables: [
      'External penetration test focused on IDOR, token leakage, and tenant isolation',
      'Chaos testing: SIM drop, tracker reboot, delayed push gateway, wrong-stop handover',
      'Automated 30-day raw location purge job and verified backup/restore drills',
      'Incident response runbook and school transport coordinator training guide',
    ],
    productionGates: [
      'Zero critical/high vulnerabilities in security assessment',
      'Signed school pilot agreement, parental consent forms, and safeguarding sign-off',
      'On-call alerting configured for telemetry ingestion lag > 30s or push delivery < 98%',
    ],
    risksAndMitigations: [
      'Launching before legal review → strictly prohibit real child PII until DPA & consents are signed',
      'Silent pipeline failures → synthetic canary bus continuously verifies end-to-end ETA alerts',
    ],
  },
  {
    id: 'stage-6',
    stageNumber: 'Stage 6',
    title: 'Controlled School Pilot → Production Rollout',
    phaseLabel: 'Production Launch',
    durationWeeks: '4–6 weeks',
    teamProfile: 'Founder + Pilot Support Lead + Core Eng Team',
    budgetBand: '$4k – $8k + Hardware',
    objective:
      'Launch on 2–4 real buses at 1 partner school, measure real parent/school outcomes, and harden for multi-school scaling.',
    deliverables: [
      'Hardware installation & physical route geofence calibration on pilot buses',
      'Parent onboarding kit (QR invite links scoped to verified guardian phone numbers)',
      'Weekly pilot scorecard: waiting time saved, ETA accuracy, dispatch call reduction',
      'Phase 2 expansion backlog (NFC smart tags, route optimization, SIS integrations)',
    ],
    productionGates: [
      '≥ 97% of scheduled journeys tracked end-to-end without manual intervention',
      '≥ 60% reduction in "Where is the bus?" calls to school transport office',
      '≥ 85% weekly active parent confidence rating before expanding to School #2',
    ],
    risksAndMitigations: [
      'Low parent adoption → coordinate launch with school headmaster orientation & SMS invite',
      'Hardware installation glitches → carry 1 pre-configured spare GPS tracker per 10 buses',
    ],
  },
];

export const ARCHITECTURE_LAYERS = [
  {
    id: 'edge',
    layer: '01. Edge & Telemetry Ingestion',
    stack: 'Hardwired GPS Tracker (MQTT / TCP) · Attendant Tablet (Offline Queue)',
    responsibility:
      'Streams encrypted vehicle coordinates every 5–10s with ignition & battery state. Zero driver interaction while moving.',
  },
  {
    id: 'realtime',
    layer: '02. Geospatial & Journey State Engine',
    stack: 'Node.js / Fastify · Redis Streams · PostgreSQL + PostGIS',
    responsibility:
      'Runs the deterministic Journey State Machine, snaps telemetry to route corridors, evaluates stop geofences with hysteresis, and detects delays or deviations.',
  },
  {
    id: 'rbac',
    layer: '03. Multi-Tenant RBAC & Privacy Gateway',
    stack: 'OAuth2 / Short-Lived JWT · Row-Level Security (school_id) · Audit Log',
    responsibility:
      'Enforces Visibility Without Exposure. Projects parent queries down to relative ETA and assigned stop only; blocks cross-family or public route enumeration.',
  },
  {
    id: 'delivery',
    layer: '04. Event-Driven Notifications & Clients',
    stack: 'WebSockets · FCM / APNs Push · SMS Fallback · React / React Native',
    responsibility:
      'Pushes approaching, boarding, delay, and completion events respecting quiet hours; fails over to SMS when mobile push ACK times out.',
  },
];

export const RBAC_VISIBILITY_MATRIX = [
  {
    capability: 'Live bus coordinates & ETA',
    parent: 'Assigned route only (active trip)',
    driver: 'Own vehicle next-stop HUD',
    attendant: 'Assigned route stops',
    schoolAdmin: 'All school fleet vehicles',
    platformAdmin: 'Aggregated health only',
  },
  {
    capability: 'Other students’ home pickup stops',
    parent: 'Blocked (stripped at API)',
    driver: 'Stop names only',
    attendant: 'Assigned route roster only',
    schoolAdmin: 'Authorized school roster',
    platformAdmin: 'Blocked (no raw PII)',
  },
  {
    capability: 'Boarding & handover timestamps',
    parent: 'Own child only',
    driver: 'Summary count only',
    attendant: 'Write access (assigned trip)',
    schoolAdmin: 'Full school audit view',
    platformAdmin: 'Blocked',
  },
  {
    capability: 'Route deviation & delay alerts',
    parent: 'Calm delay ETA update',
    driver: 'Audio/passive cue only',
    attendant: 'Incident flag button',
    schoolAdmin: 'Real-time Safety Layer + Broadcast',
    platformAdmin: 'System uptime alerts',
  },
  {
    capability: 'Raw 30-day GPS history',
    parent: 'Blocked',
    driver: 'Blocked',
    attendant: 'Blocked',
    schoolAdmin: 'Audited incident export only',
    platformAdmin: 'Auto-purged after 30 days',
  },
];

export const PILOT_SUCCESS_METRICS = [
  {
    metric: 'Unnecessary waiting eliminated',
    target: '11–16 min / family / day',
    measurement: 'Parent pre- vs post-pilot wait survey + approaching notification timestamp',
  },
  {
    metric: 'ETA prediction accuracy',
    target: '±90 sec median error',
    measurement: 'Predicted approaching time vs actual geofence arrival at stop',
  },
  {
    metric: 'Journeys tracked end-to-end',
    target: '≥ 97.5% of scheduled trips',
    measurement: 'Completed state-machine transitions without GPS blackout',
  },
  {
    metric: 'School transport office calls',
    target: '≥ 65% reduction in "Where is the bus?" calls',
    measurement: '2-week pre-pilot call tally vs Week 4 live pilot tally',
  },
  {
    metric: 'Irregularity response time',
    target: '< 3 min from alert to parent advisory',
    measurement: 'Safety Layer trigger timestamp to coordinator broadcast ack',
  },
];
