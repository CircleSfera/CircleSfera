import type { INestApplication } from '@nestjs/common';
import { UserEventType } from '@prisma/client';
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
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import {
  ADMIN_BEARER,
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';

describe('AnalyticsController', () => {
  let app: INestApplication;

  const mockAnalyticsService = {
    logEvent: vi.fn(),
    logEventsBatch: vi.fn(),
    getCreatorDashboard: vi.fn(),
    trackPostView: vi.fn(),
    trackFrameLoop: vi.fn(),
    trackFrameWatchTime: vi.fn(),
    getPostInsights: vi.fn(),
    performDailyAggregation: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnalyticsService, useValue: mockAnalyticsService },
      ],
      guards: [
        { guard: JwtOptionalGuard, mode: 'optional' },
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

  it('rejects a dashboard read without a session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/analytics/dashboard')
      .expect(401);

    expect(mockAnalyticsService.getCreatorDashboard).not.toHaveBeenCalled();
  });

  it('rejects an event with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/analytics/events')
      .send({
        eventType: UserEventType.IMPRESSION,
        targetId: 'post-1',
        targetType: 'POST',
        userId: 'attacker',
      })
      .expect(400);

    expect(mockAnalyticsService.logEvent).not.toHaveBeenCalled();
  });

  it('logs an event without a profile when anonymous', async () => {
    mockAnalyticsService.logEvent.mockResolvedValue(undefined);

    const res = await request(app.getHttpServer())
      .post('/api/v1/analytics/events')
      .send({
        eventType: UserEventType.IMPRESSION,
        targetId: 'post-1',
        targetType: 'POST',
      })
      .expect(201);

    expect(res.body).toEqual({ success: true });
    expect(mockAnalyticsService.logEvent).toHaveBeenCalledWith(null, {
      eventType: UserEventType.IMPRESSION,
      targetId: 'post-1',
      targetType: 'POST',
    });
  });

  it('logs an event as the session userId', async () => {
    mockAnalyticsService.logEvent.mockResolvedValue(undefined);

    await request(app.getHttpServer())
      .post('/api/v1/analytics/events')
      .set(BEARER)
      .send({
        eventType: UserEventType.IMPRESSION,
        targetId: 'post-1',
        targetType: 'POST',
      })
      .expect(201);

    expect(mockAnalyticsService.logEvent).toHaveBeenCalledWith(
      TEST_USER.userId,
      {
        eventType: UserEventType.IMPRESSION,
        targetId: 'post-1',
        targetType: 'POST',
      },
    );
  });

  it('logs a batch as the session userId', async () => {
    mockAnalyticsService.logEventsBatch.mockResolvedValue(undefined);

    const dto = {
      events: [
        {
          eventType: UserEventType.IMPRESSION,
          targetId: 'post-1',
          targetType: 'POST',
        },
      ],
    };

    await request(app.getHttpServer())
      .post('/api/v1/analytics/events/batch')
      .set(BEARER)
      .send(dto)
      .expect(201);

    expect(mockAnalyticsService.logEventsBatch).toHaveBeenCalledWith(
      TEST_USER.userId,
      dto,
    );
  });

  it('rejects debug aggregate with a user session', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/analytics/debug/aggregate')
      .query({ profileId: 'profile-1' })
      .set(BEARER)
      .expect(401);

    expect(mockAnalyticsService.performDailyAggregation).not.toHaveBeenCalled();
  });

  it('rejects debug aggregate without a profileId query', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/analytics/debug/aggregate')
      .set(ADMIN_BEARER)
      .expect(400);

    expect(mockAnalyticsService.performDailyAggregation).not.toHaveBeenCalled();
  });

  it('runs debug aggregate with an admin session', async () => {
    mockAnalyticsService.performDailyAggregation.mockResolvedValue({
      ok: true,
    });

    await request(app.getHttpServer())
      .post('/api/v1/analytics/debug/aggregate')
      .query({ profileId: 'profile-1' })
      .set(ADMIN_BEARER)
      .expect(201);

    expect(mockAnalyticsService.performDailyAggregation).toHaveBeenCalledWith(
      'profile-1',
    );
  });

  it('fetches creator dashboard with and without days parameter', async () => {
    mockAnalyticsService.getCreatorDashboard.mockResolvedValue({ stats: [] });

    await request(app.getHttpServer())
      .get('/api/v1/analytics/dashboard')
      .set(BEARER)
      .expect(200);

    expect(mockAnalyticsService.getCreatorDashboard).toHaveBeenCalledWith(
      TEST_USER.profileId,
      30,
    );

    await request(app.getHttpServer())
      .get('/api/v1/analytics/dashboard')
      .query({ days: '7' })
      .set(BEARER)
      .expect(200);

    expect(mockAnalyticsService.getCreatorDashboard).toHaveBeenCalledWith(
      TEST_USER.profileId,
      7,
    );
  });

  it('tracks post view, loop, watch time, and fetches insights', async () => {
    mockAnalyticsService.trackPostView.mockResolvedValue({ success: true });
    mockAnalyticsService.trackFrameLoop.mockResolvedValue({ success: true });
    mockAnalyticsService.trackFrameWatchTime.mockResolvedValue({
      success: true,
    });
    mockAnalyticsService.getPostInsights.mockResolvedValue({ views: 10 });

    await request(app.getHttpServer())
      .post('/api/v1/analytics/post/post-1/view')
      .set(BEARER)
      .expect(201);
    expect(mockAnalyticsService.trackPostView).toHaveBeenCalledWith(
      'post-1',
      TEST_USER.profileId,
    );

    await request(app.getHttpServer())
      .post('/api/v1/analytics/post/post-1/loop')
      .set(BEARER)
      .expect(201);
    expect(mockAnalyticsService.trackFrameLoop).toHaveBeenCalledWith('post-1');

    await request(app.getHttpServer())
      .post('/api/v1/analytics/post/post-1/watch')
      .query({ seconds: '15.5' })
      .set(BEARER)
      .expect(201);
    expect(mockAnalyticsService.trackFrameWatchTime).toHaveBeenCalledWith(
      'post-1',
      15.5,
    );

    const insightsRes = await request(app.getHttpServer())
      .get('/api/v1/analytics/post/post-1/insights')
      .set(BEARER)
      .expect(200);
    expect(insightsRes.body).toEqual({ views: 10 });
    expect(mockAnalyticsService.getPostInsights).toHaveBeenCalledWith('post-1');
  });
});
