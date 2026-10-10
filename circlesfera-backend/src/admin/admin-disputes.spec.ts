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
import { AdminDisputesController } from './admin-disputes.controller.js';
import { AdminDisputesService } from './admin-disputes.service.js';

// The staff list of disputes: what it asks the database for, and its route.
describe('AdminDisputesService', () => {
  const prisma = {
    paymentDispute: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };
  const service = new AdminDisputesService(prisma as never);
  const query = () => prisma.paymentDispute.findMany.mock.calls[0][0];

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.paymentDispute.findMany.mockResolvedValue([]);
    prisma.paymentDispute.count.mockResolvedValue(0);
  });

  it('lists every dispute, open ones first and the one due soonest on top', async () => {
    await service.getDisputes();

    expect(query().where).toEqual({});
    expect(query().orderBy).toEqual([
      { closedAt: { sort: 'desc', nulls: 'first' } },
      { evidenceDueBy: { sort: 'asc', nulls: 'last' } },
      { openedAt: 'desc' },
    ]);
  });

  it('filters open and closed disputes', async () => {
    await service.getDisputes(1, 20, 'open');
    expect(query().where).toEqual({ closedAt: null });

    prisma.paymentDispute.findMany.mockClear();
    await service.getDisputes(1, 20, 'closed');
    expect(query().where).toEqual({ closedAt: { not: null } });
  });

  it('always reports how many are open, whatever the filter', async () => {
    prisma.paymentDispute.count
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(2);

    const result = await service.getDisputes(1, 20, 'closed');

    expect(prisma.paymentDispute.count).toHaveBeenLastCalledWith({
      where: { closedAt: null },
    });
    expect(result.meta).toEqual({
      total: 9,
      page: 1,
      limit: 20,
      totalPages: 1,
      openCount: 2,
    });
  });
});

describe('AdminDisputesController', () => {
  let app: INestApplication;
  const mockService = { getDisputes: vi.fn() };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [AdminDisputesController],
      providers: [{ provide: AdminDisputesService, useValue: mockService }],
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
    mockService.getDisputes.mockResolvedValue({ data: [], meta: {} });
  });

  it('requires the payments permission', () => {
    expect(
      new Reflector().get(STAFF_PERMISSIONS_KEY, AdminDisputesController),
    ).toEqual(['payments']);
  });

  it('answers 401 without a staff session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/disputes')
      .expect(401);
  });

  it('passes the page and the state to the list', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/disputes?page=2&limit=10&state=open')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.getDisputes).toHaveBeenCalledWith(2, 10, 'open');
  });

  it('rejects a state that does not exist', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/disputes?state=won')
      .set(ADMIN_BEARER)
      .expect(400);
  });
});
