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
import { AnalyticsService } from '../analytics/analytics.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { SubscriptionGuard } from '../auth/guards/subscription.guard.js';
import {
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { CreatorController } from './creator.controller.js';
import { ExportAnalyticsCsvUseCase } from './use-cases/analytics/commands/export-analytics-csv.use-case.js';
import { GetAudienceRetentionQuery } from './use-cases/analytics/queries/get-audience-retention.query.js';
import { GetCreatorStatsQuery } from './use-cases/analytics/queries/get-creator-stats.query.js';
import { GetRevenueAnalyticsQuery } from './use-cases/analytics/queries/get-revenue-analytics.query.js';
import { GetTopContentQuery } from './use-cases/analytics/queries/get-top-content.query.js';
import { GetCreatorPostsQuery } from './use-cases/content/queries/get-creator-posts.query.js';
import { GetCreatorStoriesQuery } from './use-cases/content/queries/get-creator-stories.query.js';
import { CreatePromotionUseCase } from './use-cases/promotions/commands/create-promotion.use-case.js';
import { ManagePromotionUseCase } from './use-cases/promotions/commands/manage-promotion.use-case.js';
import { RecordPromotionInteractionUseCase } from './use-cases/promotions/commands/record-promotion-interaction.use-case.js';
import { GetPromotionsQuery } from './use-cases/promotions/queries/get-promotions.query.js';

describe('CreatorController', () => {
  let app: INestApplication;

  const mockAnalyticsService = {
    getCreatorDashboard: vi.fn(),
  };
  const mockGetCreatorStatsQ = { execute: vi.fn() };
  const mockGetRevenueAnalyticsQ = { execute: vi.fn() };
  const mockGetAudienceRetentionQ = { execute: vi.fn() };
  const mockGetTopContentQ = { execute: vi.fn() };
  const mockExportAnalyticsCsvUC = { execute: vi.fn() };
  const mockGetCreatorPostsQ = { execute: vi.fn() };
  const mockGetCreatorStoriesQ = { execute: vi.fn() };
  const mockGetPromotionsQ = { execute: vi.fn() };
  const mockCreatePromotionUC = { execute: vi.fn() };
  const mockManagePromotionUC = {
    cancelPromotion: vi.fn(),
    pausePromotion: vi.fn(),
    resumePromotion: vi.fn(),
    updatePromotion: vi.fn(),
  };
  const mockRecordPromotionInteractionUC = {
    recordView: vi.fn(),
    recordClick: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [CreatorController],
      providers: [
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: GetCreatorStatsQuery, useValue: mockGetCreatorStatsQ },
        {
          provide: GetRevenueAnalyticsQuery,
          useValue: mockGetRevenueAnalyticsQ,
        },
        {
          provide: GetAudienceRetentionQuery,
          useValue: mockGetAudienceRetentionQ,
        },
        { provide: GetTopContentQuery, useValue: mockGetTopContentQ },
        {
          provide: ExportAnalyticsCsvUseCase,
          useValue: mockExportAnalyticsCsvUC,
        },
        { provide: GetCreatorPostsQuery, useValue: mockGetCreatorPostsQ },
        { provide: GetCreatorStoriesQuery, useValue: mockGetCreatorStoriesQ },
        { provide: GetPromotionsQuery, useValue: mockGetPromotionsQ },
        { provide: CreatePromotionUseCase, useValue: mockCreatePromotionUC },
        { provide: ManagePromotionUseCase, useValue: mockManagePromotionUC },
        {
          provide: RecordPromotionInteractionUseCase,
          useValue: mockRecordPromotionInteractionUC,
        },
      ],
      guards: [
        { guard: JwtAuthGuard, mode: 'session' },
        { guard: SubscriptionGuard, mode: 'allow' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects stats without a session', async () => {
    await request(app.getHttpServer()).get('/api/v1/creator/stats').expect(401);

    expect(mockGetCreatorStatsQ.execute).not.toHaveBeenCalled();
  });

  it('reads stats as the session profileId', async () => {
    const stats = { followers: 100, revenueCents: 5000 };
    mockGetCreatorStatsQ.execute.mockResolvedValue(stats);

    const res = await request(app.getHttpServer())
      .get('/api/v1/creator/stats')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual(stats);
    expect(mockGetCreatorStatsQ.execute).toHaveBeenCalledWith(
      TEST_USER.profileId,
    );
  });

  it('returns daily metrics from analytics dashboard', async () => {
    const dailyMetrics = [{ date: '2026-01-01', views: 10 }];
    mockAnalyticsService.getCreatorDashboard.mockResolvedValue({
      charts: { dailyMetrics },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/creator/activity-chart')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual(dailyMetrics);
    expect(mockAnalyticsService.getCreatorDashboard).toHaveBeenCalledWith(
      TEST_USER.profileId,
      14,
    );
  });

  it('lists posts with parsed pagination defaults', async () => {
    mockGetCreatorPostsQ.execute.mockResolvedValue({ items: [] });

    await request(app.getHttpServer())
      .get('/api/v1/creator/posts')
      .set(BEARER)
      .expect(200);

    expect(mockGetCreatorPostsQ.execute).toHaveBeenCalledWith(
      TEST_USER.profileId,
      1,
      10,
      undefined,
    );
  });

  it('passes page, limit and type when provided', async () => {
    mockGetCreatorPostsQ.execute.mockResolvedValue({ items: [] });

    await request(app.getHttpServer())
      .get('/api/v1/creator/posts')
      .query({ page: 2, limit: 20, type: 'FRAME' })
      .set(BEARER)
      .expect(200);

    expect(mockGetCreatorPostsQ.execute).toHaveBeenCalledWith(
      TEST_USER.profileId,
      2,
      20,
      'FRAME',
    );
  });

  it('rejects a promotion when required fields are missing', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/creator/promotions')
      .set(BEARER)
      .send({
        targetType: 'POST',
        targetId: 'post-1',
        durationDays: 7,
      })
      .expect(400);

    expect(mockCreatePromotionUC.execute).not.toHaveBeenCalled();
  });

  it('creates a promotion as the session userId', async () => {
    mockCreatePromotionUC.execute.mockResolvedValue({ id: 'promo-1' });

    const res = await request(app.getHttpServer())
      .post('/api/v1/creator/promotions')
      .set(BEARER)
      .send({
        targetType: 'POST',
        targetId: 'post-1',
        budget: 1000,
        durationDays: 7,
      })
      .expect(201);

    expect(res.body).toEqual({ id: 'promo-1' });
    expect(mockCreatePromotionUC.execute).toHaveBeenCalledWith(
      TEST_USER.userId,
      'POST',
      'post-1',
      7,
      1000,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
  });

  it('records a promotion view as the session userId', async () => {
    mockRecordPromotionInteractionUC.recordView.mockResolvedValue({
      success: true,
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/creator/promotions/promo-1/view')
      .set(BEARER)
      .expect(201);

    expect(res.body).toEqual({ success: true });
    expect(mockRecordPromotionInteractionUC.recordView).toHaveBeenCalledWith(
      'promo-1',
      TEST_USER.userId,
    );
  });
});
