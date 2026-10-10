import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
import {
  ADMIN_STEP_UP_KEY,
  AdminGuard,
  STAFF_PERMISSIONS_KEY,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import {
  ADMIN_BEARER,
  createControllerApp,
  TEST_ADMIN,
} from '../common/testing/http-controller.js';
import { AdminPlansController } from './admin-plans.controller.js';
import { AdminPlansService } from './admin-plans.service.js';

describe('AdminPlansController', () => {
  let app: INestApplication;

  const mockService = {
    getPlans: vi.fn(),
    updatePlan: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [AdminPlansController],
      providers: [{ provide: AdminPlansService, useValue: mockService }],
      guards: [
        { guard: AdminJwtAuthGuard, mode: 'admin' },
        { guard: AdminGuard, mode: 'allow' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires the plans permission on every route', () => {
    const reflector = new Reflector();
    expect(reflector.get(STAFF_PERMISSIONS_KEY, AdminPlansController)).toEqual([
      'plans',
    ]);
  });

  it('asks for identity reconfirmation to save, and not to read', () => {
    const reflector = new Reflector();
    expect(
      reflector.get(
        ADMIN_STEP_UP_KEY,
        AdminPlansController.prototype.updatePlan,
      ),
    ).toBe(true);
    expect(
      reflector.get(ADMIN_STEP_UP_KEY, AdminPlansController.prototype.getPlans),
    ).toBeUndefined();
  });

  it('answers 401 without a staff session', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/plans').expect(401);
  });

  it('GET /admin/plans returns the catalogue', async () => {
    mockService.getPlans.mockResolvedValue({ plans: [], featureKeys: [] });

    await request(app.getHttpServer())
      .get('/api/v1/admin/plans')
      .set(ADMIN_BEARER)
      .expect(200)
      .expect({ plans: [], featureKeys: [] });
  });

  it('PATCH /admin/plans/:id saves on behalf of the signed-in staff member', async () => {
    mockService.updatePlan.mockResolvedValue({ id: 'plan-1' });

    await request(app.getHttpServer())
      .patch('/api/v1/admin/plans/plan-1')
      .set(ADMIN_BEARER)
      .send({ features: ['verified_badge'], isActive: true })
      .expect(200);

    expect(mockService.updatePlan).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      'plan-1',
      { features: ['verified_badge'], isActive: true },
    );
  });

  it('rejects a feature that the code does not know', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/admin/plans/plan-1')
      .set(ADMIN_BEARER)
      .send({ features: ['search_priority'] })
      .expect(400);

    expect(mockService.updatePlan).not.toHaveBeenCalled();
  });

  it('rejects a request that tries to set a price', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/admin/plans/plan-1')
      .set(ADMIN_BEARER)
      .send({ isActive: true, priceCents: 1 })
      .expect(400);

    expect(mockService.updatePlan).not.toHaveBeenCalled();
  });
});
