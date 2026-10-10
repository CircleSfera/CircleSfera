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
  AdminGuard,
  STAFF_PERMISSIONS_KEY,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import {
  ADMIN_BEARER,
  createControllerApp,
} from '../common/testing/http-controller.js';
import { AdminSubscriptionsController } from './admin-subscriptions.controller.js';
import { AdminSubscriptionsService } from './admin-subscriptions.service.js';

describe('AdminSubscriptionsController', () => {
  let app: INestApplication;
  const mockService = { getSubscriptions: vi.fn() };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [AdminSubscriptionsController],
      providers: [
        { provide: AdminSubscriptionsService, useValue: mockService },
      ],
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
    mockService.getSubscriptions.mockResolvedValue({ data: [], meta: {} });
  });

  it('requires the payments permission', () => {
    expect(
      new Reflector().get(STAFF_PERMISSIONS_KEY, AdminSubscriptionsController),
    ).toEqual(['payments']);
  });

  it('answers 401 without a staff session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/subscriptions')
      .expect(401);
  });

  it('passes the page and the filters to the list', async () => {
    const planId = '0b9c7f4e-3a55-4d0e-9d4f-2f1f4f0c1a11';

    await request(app.getHttpServer())
      .get('/api/v1/admin/subscriptions')
      .query({ page: 2, limit: 10, status: 'ACTIVE', planId, search: 'ana' })
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.getSubscriptions).toHaveBeenCalledWith(2, 10, {
      status: 'ACTIVE',
      planId,
      search: 'ana',
    });
  });

  it('rejects a state that does not exist', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/subscriptions?status=PAUSED')
      .set(ADMIN_BEARER)
      .expect(400);

    expect(mockService.getSubscriptions).not.toHaveBeenCalled();
  });

  it('offers no way to change a subscription', async () => {
    for (const method of ['post', 'patch', 'put', 'delete'] as const) {
      await request(app.getHttpServer())
        [method]('/api/v1/admin/subscriptions')
        .set(ADMIN_BEARER)
        .expect(404);
    }
  });
});
