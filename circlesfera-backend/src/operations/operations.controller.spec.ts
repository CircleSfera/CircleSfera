import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { CurrentAdminData } from '../auth/decorators/current-admin.decorator.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import {
  ADMIN_BEARER,
  BEARER,
  createControllerApp,
} from '../common/testing/http-controller.js';
import { CspReportStore } from '../security-reports/csp-report.store.js';
import { OperationsController } from './operations.controller.js';
import { OrphanFilesReportService } from './orphan-files-report.service.js';
import { ServerResourcesService } from './server-resources.service.js';
import { WarehouseReportService } from './warehouse-report.service.js';

const ROUTES = [
  ['resources', 'collect'],
  ['warehouse', 'report'],
  ['csp', 'summary'],
  ['orphan-files', 'report'],
] as const;

const staff = (permissions: string[]): CurrentAdminData => ({
  adminId: 'staff-1',
  userId: 'staff-1',
  email: 'staff@example.com',
  displayName: 'Staff',
  permissions,
  roles: ['SUPPORT'],
  stepUpVerified: true,
});

describe('OperationsController', () => {
  const resources = { collect: vi.fn() };
  const warehouse = { report: vi.fn() };
  const csp = { summary: vi.fn() };
  const orphans = { report: vi.fn() };
  const services: Record<string, Record<string, ReturnType<typeof vi.fn>>> = {
    resources,
    warehouse,
    csp,
    'orphan-files': orphans,
  };

  // The real AdminGuard: only the staff session itself is stubbed.
  const appFor = (admin: CurrentAdminData) =>
    createControllerApp({
      controllers: [OperationsController],
      providers: [
        { provide: ServerResourcesService, useValue: resources },
        { provide: WarehouseReportService, useValue: warehouse },
        { provide: CspReportStore, useValue: csp },
        { provide: OrphanFilesReportService, useValue: orphans },
      ],
      guards: [{ guard: AdminJwtAuthGuard, mode: 'admin' }],
      admin,
    });

  let withSystem: INestApplication;
  let withoutSystem: INestApplication;
  let externalReviewer: INestApplication;

  beforeAll(async () => {
    withSystem = await appFor(staff(['system']));
    withoutSystem = await appFor(staff(['users.read', 'payments', 'support']));
    // An external reviewer's session opens the review area only, whatever
    // its identity holds.
    externalReviewer = await appFor({
      ...staff(['system', 'review']),
      externalReviewer: true,
    });
  });

  afterAll(async () => {
    await withSystem.close();
    await withoutSystem.close();
    await externalReviewer.close();
  });

  it.each(ROUTES)(
    'refuses %s to an external reviewer, even one whose identity holds system',
    async (route, method) => {
      await request(externalReviewer.getHttpServer())
        .get(`/api/v1/admin/operations/${route}`)
        .set(ADMIN_BEARER)
        .expect(403);

      expect(services[route][method]).not.toHaveBeenCalled();
    },
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(ROUTES)(
    'answers %s to staff with the system permission',
    async (route, method) => {
      const answer = { generatedAt: '2026-11-25T10:00:00.000Z', route };
      services[route][method].mockResolvedValue(answer);

      await request(withSystem.getHttpServer())
        .get(`/api/v1/admin/operations/${route}`)
        .set(ADMIN_BEARER)
        .expect(200)
        .expect(answer);

      expect(services[route][method]).toHaveBeenCalledTimes(1);
    },
  );

  it.each(ROUTES)(
    'refuses %s to staff without the system permission',
    async (route, method) => {
      await request(withoutSystem.getHttpServer())
        .get(`/api/v1/admin/operations/${route}`)
        .set(ADMIN_BEARER)
        .expect(403);

      expect(services[route][method]).not.toHaveBeenCalled();
    },
  );

  it.each(ROUTES)(
    'refuses %s to a person signed in to the app, and to no session',
    async (route, method) => {
      await request(withSystem.getHttpServer())
        .get(`/api/v1/admin/operations/${route}`)
        .set(BEARER)
        .expect(401);
      await request(withSystem.getHttpServer())
        .get(`/api/v1/admin/operations/${route}`)
        .expect(401);

      expect(services[route][method]).not.toHaveBeenCalled();
    },
  );
});
