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
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  ADMIN_BEARER,
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { ReportReason, ReportTargetType } from './dto/create-report.dto.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

describe('ReportsController', () => {
  let app: INestApplication;

  const mockService = {
    create: vi.fn(),
    findMyReports: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [ReportsController],
      providers: [{ provide: ReportsService, useValue: mockService }],
      guards: [
        { guard: JwtAuthGuard, mode: 'session' },
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

  it('rejects create without a session', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/reports')
      .send({
        targetType: ReportTargetType.POST,
        targetId: 'post-1',
        reason: ReportReason.SPAM,
      })
      .expect(401);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('rejects create with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/reports')
      .set(BEARER)
      .send({
        targetType: ReportTargetType.POST,
        targetId: 'post-1',
        reason: ReportReason.SPAM,
        reporterId: 'attacker',
      })
      .expect(400);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('files a report as the session profile', async () => {
    mockService.create.mockResolvedValue({ id: 'report-1' });

    const res = await request(app.getHttpServer())
      .post('/api/v1/reports')
      .set(BEARER)
      .send({
        targetType: ReportTargetType.POST,
        targetId: 'post-1',
        reason: ReportReason.SPAM,
      })
      .expect(201);

    expect(res.body).toEqual({ id: 'report-1' });
    expect(mockService.create).toHaveBeenCalledWith(TEST_USER.profileId, {
      targetType: ReportTargetType.POST,
      targetId: 'post-1',
      reason: ReportReason.SPAM,
    });
  });

  it('lists the caller reports with pagination', async () => {
    mockService.findMyReports.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/reports/me')
      .query({ page: 1, limit: 10 })
      .set(BEARER)
      .expect(200);

    expect(mockService.findMyReports).toHaveBeenCalledWith(
      TEST_USER.profileId,
      expect.objectContaining({ page: 1, limit: 10 }),
    );
  });

  it('rejects listing all reports with a user session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/reports')
      .query({ page: 1, limit: 10 })
      .set(BEARER)
      .expect(401);

    expect(mockService.findAll).not.toHaveBeenCalled();
  });

  it('lists all reports with an admin session', async () => {
    mockService.findAll.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/reports')
      .query({ page: 1, limit: 10 })
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 10 }),
    );
  });

  it('updates a report status with an admin session', async () => {
    mockService.update.mockResolvedValue({
      id: 'report-1',
      status: 'REVIEWING',
    });

    await request(app.getHttpServer())
      .patch('/api/v1/reports/report-1')
      .set(ADMIN_BEARER)
      .send({ status: 'REVIEWING' })
      .expect(200);

    expect(mockService.update).toHaveBeenCalledWith(
      'report-1',
      'REVIEWING',
      undefined,
    );
  });
});
