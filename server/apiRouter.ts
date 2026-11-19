import express, { Request, Response } from 'express';
import {
  BACKEND_IMPROVEMENT_RECOMMENDATIONS,
  SafariBackendStore,
  SafariUserRole,
} from './safariBackend';
import { PRODUCTION_POSTGRES_POSTGIS_DDL } from './schema.sql';
import {
  BoardingStatus,
  DriverStatus,
  TrafficLevel,
  VerificationMethod,
} from '../src/types/safari';

export function createSafariApiRouter(store = new SafariBackendStore()) {
  const router = express.Router();
  router.use(express.json());

  const getRole = (req: Request): SafariUserRole => {
    const header = (req.headers['x-safari-role'] as string | undefined)?.toLowerCase();
    if (
      header === 'parent' ||
      header === 'driver' ||
      header === 'attendant' ||
      header === 'school_admin' ||
      header === 'platform_admin'
    ) {
      return header;
    }
    return 'school_admin';
  };

  // 1. System Health, Audit Chain Integrity & Weighted Traffic Profiles
  router.get('/health', (_req: Request, res: Response) => {
    res.json(store.getSystemHealth());
  });

  // 2. Production SQL Schema & Engineering Improvement Recommendations
  router.get('/architecture/infrastructure', (_req: Request, res: Response) => {
    res.json({
      health: store.getSystemHealth(),
      postgresPostgisSchema: PRODUCTION_POSTGRES_POSTGIS_DDL,
      improvementRecommendations: BACKEND_IMPROVEMENT_RECOMMENDATIONS,
      endpoints: [
        {
          method: 'GET',
          path: '/api/v1/health',
          description: 'Live telemetry engine health, SHA-256 audit chain verification & traffic weight profiles',
        },
        {
          method: 'GET',
          path: '/api/v1/fleet/snapshot',
          description: 'Full school operations snapshot (routes, vehicles, students, alerts, hash-chained audit trail)',
        },
        {
          method: 'GET',
          path: '/api/v1/parent/snapshot/:studentId',
          description: 'RBAC privacy-scoped parent projection (strips other families’ stops, buses & student PII)',
        },
        {
          method: 'GET',
          path: '/api/v1/routes/:routeId/eta',
          description: 'Traffic-weighted stop-by-stop ETA breakdown (schedule vs kinematic blend, dwell & window)',
        },
        {
          method: 'PATCH',
          path: '/api/v1/routes/:routeId/traffic',
          description: 'Update live corridor TrafficLevel (clear | moderate | heavy) and recalculate fleet telemetry',
        },
        {
          method: 'POST',
          path: '/api/v1/handovers/confirm',
          description: 'Record QR scan or attendant boarding/drop-off proof into SHA-256 hash-chained audit ledger',
        },
        {
          method: 'POST',
          path: '/api/v1/telemetry/step',
          description: 'Advance server-authoritative fleet telemetry tick and evaluate geofence approaching alerts',
        },
      ],
    });
  });

  // 3. School Admin Full Fleet Snapshot (Protected against 'parent' role exposure)
  router.get('/fleet/snapshot', (req: Request, res: Response) => {
    const role = getRole(req);
    if (role === 'parent') {
      res.status(403).json({
        error: 'FORBIDDEN_VISIBILITY_BOUNDARY',
        message:
          'Parent role cannot query full school fleet or other students. Use /api/v1/parent/snapshot/:studentId.',
      });
      return;
    }
    res.json(store.getFullSchoolSnapshot());
  });

  // 4. Parent-Scoped Privacy Snapshot ("Visibility Without Exposure")
  router.get('/parent/snapshot/:studentId', (req: Request, res: Response) => {
    const studentId = String(req.params.studentId || 'stu-01');
    const scoped = store.getParentScopedView(studentId);
    if (!scoped) {
      res.status(404).json({
        error: 'STUDENT_NOT_FOUND',
        message: `No parent-scoped transport record found for ${studentId}.`,
      });
      return;
    }
    res.json(scoped);
  });

  // 5. Weighted Stop-by-Stop ETA Calculation Breakdown for a Route
  router.get('/routes/:routeId/eta', (req: Request, res: Response) => {
    const routeId = String(req.params.routeId);
    const result = store.calculateRouteStopEtas(routeId);
    if (!result) {
      res.status(404).json({
        error: 'ROUTE_NOT_FOUND',
        message: `Route ${routeId} not found in active telemetry engine.`,
      });
      return;
    }
    res.json(result);
  });

  // 6. Update Route TrafficLevel or Vehicle Assignment
  router.patch('/routes/:routeId/traffic', (req: Request, res: Response) => {
    const role = getRole(req);
    if (role === 'parent') {
      res.status(403).json({
        error: 'FORBIDDEN_ROLE',
        message: 'Only school operations or platform admins can modify corridor traffic levels.',
      });
      return;
    }

    const routeId = String(req.params.routeId);
    const {
      trafficLevel,
      vehicleLabel,
      plateNumber,
      driverName,
      driverStatus,
      attendantName,
    } = req.body as {
      trafficLevel?: TrafficLevel;
      vehicleLabel?: string;
      plateNumber?: string;
      driverName?: string;
      driverStatus?: DriverStatus;
      attendantName?: string;
    };

    if (
      trafficLevel &&
      trafficLevel !== 'clear' &&
      trafficLevel !== 'moderate' &&
      trafficLevel !== 'heavy'
    ) {
      res.status(400).json({
        error: 'INVALID_TRAFFIC_LEVEL',
        message: 'trafficLevel must be one of: clear, moderate, heavy.',
      });
      return;
    }

    const updated = store.updateRoute(routeId, {
      ...(trafficLevel ? { trafficLevel } : {}),
      ...(vehicleLabel ? { vehicleLabel } : {}),
      ...(plateNumber ? { plateNumber } : {}),
      ...(driverName ? { driverName } : {}),
      ...(driverStatus ? { driverStatus } : {}),
      ...(attendantName ? { attendantName } : {}),
    });

    if (!updated) {
      res.status(404).json({
        error: 'ROUTE_NOT_FOUND',
        message: `Route ${routeId} not found.`,
      });
      return;
    }

    res.json({
      route: updated,
      etaSummary: store.calculateRouteStopEtas(routeId),
    });
  });

  // 7. Create New Route & Launch Live GPS Tracking
  router.post('/routes', (req: Request, res: Response) => {
    const role = getRole(req);
    if (role === 'parent') {
      res.status(403).json({
        error: 'FORBIDDEN_ROLE',
        message: 'Only school administrators can create transport routes.',
      });
      return;
    }

    const body = req.body ?? {};
    if (!body.name || !body.code || !body.vehicleLabel) {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'name, code, and vehicleLabel are required.',
      });
      return;
    }

    const created = store.createRoute({
      name: String(body.name),
      code: String(body.code),
      vehicleLabel: String(body.vehicleLabel),
      plateNumber: String(body.plateNumber ?? 'KDL 500A'),
      driverName: String(body.driverName ?? 'Josephine Wairimu'),
      attendantName: String(body.attendantName ?? 'Mercy Njeri'),
      corridorSector:
        body.corridorSector === 'northwest' || body.corridorSector === 'southeast'
          ? body.corridorSector
          : 'northeast',
      firstStopName: String(body.firstStopName ?? 'Eastwood Gate'),
      secondStopName: String(body.secondStopName ?? 'Crestview Plaza'),
      trafficLevel:
        body.trafficLevel === 'moderate' || body.trafficLevel === 'heavy'
          ? body.trafficLevel
          : 'clear',
    });

    res.status(201).json(created);
  });

  // 8. Record Verified Boarding or Drop-Off Confirmation (SHA-256 Hash-Chained)
  router.post('/handovers/confirm', (req: Request, res: Response) => {
    const {
      studentId,
      qrCodeInput,
      activeRouteId,
      status,
      method,
      hasPhotoProof,
    } = (req.body ?? {}) as {
      studentId?: string;
      qrCodeInput?: string;
      activeRouteId?: string;
      status?: BoardingStatus;
      method?: VerificationMethod;
      hasPhotoProof?: boolean;
    };

    const result = store.recordHandoverConfirmation({
      studentId,
      qrCodeInput,
      activeRouteId,
      status: status ?? 'boarded',
      method: method ?? 'qr_scan',
      hasPhotoProof: Boolean(hasPhotoProof),
    });

    if (!result.ok) {
      const failResult = result as {
        ok: false;
        errorCode: 'NOT_FOUND' | 'WRONG_ROUTE';
        message: string;
        expectedVehicle?: string;
      };
      res.status(failResult.errorCode === 'WRONG_ROUTE' ? 409 : 404).json(failResult);
      return;
    }

    res.json({
      ...result,
      auditIntegrity: store.verifyAuditChainIntegrity(),
    });
  });

  // 9. Step Server-Authoritative Fleet Telemetry
  router.post('/telemetry/step', (req: Request, res: Response) => {
    const deltaProgress = Number(req.body?.deltaProgress ?? 0.015);
    const snapshot = store.stepSimulation(
      Number.isFinite(deltaProgress) ? deltaProgress : 0.015
    );
    res.json(snapshot);
  });

  // 10. Server-Sent Events (SSE) Real-Time Telemetry Stream
  router.get('/telemetry/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendSnapshot = () => {
      const payload = JSON.stringify({
        clockLabel: store.getClockLabel(),
        telemetry: store.getFullSchoolSnapshot().telemetry,
      });
      res.write(`event: telemetry\ndata: ${payload}\n\n`);
    };

    sendSnapshot();
    const timer = setInterval(() => {
      store.stepSimulation(0.0045, 0.15);
      sendSnapshot();
    }, 2000);

    req.on('close', () => {
      clearInterval(timer);
    });
  });

  return { router, store };
}
