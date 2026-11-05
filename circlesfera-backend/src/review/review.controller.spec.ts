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
import {
  AdminGuard,
  STAFF_PERMISSIONS_KEY,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import {
  ADMIN_BEARER,
  BEARER,
  createControllerApp,
  TEST_ADMIN,
} from '../common/testing/http-controller.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReviewController } from './review.controller.js';
import { ReviewService } from './review.service.js';
import { ReviewViewLogInterceptor } from './review-view-log.interceptor.js';

describe('ReviewController', () => {
  let app: INestApplication;
  const review = {
    summary: vi.fn().mockResolvedValue({ days: 30 }),
    paidContent: vi.fn().mockResolvedValue({ data: [] }),
    creators: vi.fn().mockResolvedValue({ data: [] }),
    enforcement: vi.fn().mockResolvedValue({ data: [] }),
  };
  const auditLog = { create: vi.fn().mockResolvedValue({}) };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [ReviewController],
      providers: [
        { provide: ReviewService, useValue: review },
        { provide: PrismaService, useValue: { adminAuditLog: auditLog } },
        ReviewViewLogInterceptor,
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
  });

  it('asks for the review permission on every page', () => {
    expect(
      Reflect.getMetadata(STAFF_PERMISSIONS_KEY, ReviewController),
    ).toEqual(['review']);
  });

  it('refuses anyone without a staff session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/review/summary')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/admin/review/summary')
      .set(BEARER)
      .expect(401);
    expect(review.summary).not.toHaveBeenCalled();
  });

  it('answers each page and writes down that it was opened', async () => {
    const server = app.getHttpServer();
    await request(server)
      .get('/api/v1/admin/review/summary')
      .set(ADMIN_BEARER)
      .expect(200, { days: 30 });
    await request(server)
      .get('/api/v1/admin/review/paid-content?kind=story&page=2&limit=10')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(server)
      .get('/api/v1/admin/review/creators?page=3')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(server)
      .get('/api/v1/admin/review/enforcement?kind=strikes')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(review.paidContent).toHaveBeenCalledWith('story', 2, 10);
    expect(review.creators).toHaveBeenCalledWith(3, undefined);
    expect(review.enforcement).toHaveBeenCalledWith(
      'strikes',
      undefined,
      undefined,
    );
    expect(auditLog.create).toHaveBeenCalledTimes(4);
    expect(auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminId: TEST_ADMIN.adminId,
        action: 'REVIEW_VIEWED',
      }),
    });
  });

  it.each([
    '/api/v1/admin/review/paid-content?kind=message',
    '/api/v1/admin/review/paid-content?limit=51',
    '/api/v1/admin/review/creators?page=0',
    '/api/v1/admin/review/enforcement',
    '/api/v1/admin/review/enforcement?kind=users',
  ])('refuses a request outside what the area shows: %s', async (url) => {
    await request(app.getHttpServer()).get(url).set(ADMIN_BEARER).expect(400);
    expect(review.paidContent).not.toHaveBeenCalled();
    expect(review.creators).not.toHaveBeenCalled();
    expect(review.enforcement).not.toHaveBeenCalled();
  });
});
