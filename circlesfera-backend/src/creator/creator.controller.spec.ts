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
import { CreatorAccountGuard } from '../auth/guards/creator-account.guard.js';
import { ElitePlanGuard } from '../auth/guards/elite-plan.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
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
        { guard: CreatorAccountGuard, mode: 'allow' },
        { guard: ElitePlanGuard, mode: 'allow' },
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
        budget: 35,
        durationDays: 7,
      })
      .expect(201);

    expect(res.body).toEqual({ id: 'promo-1' });
    // The kind arrives in lower case, the way the ownership check reads it.
    expect(mockCreatePromotionUC.execute).toHaveBeenCalledWith(
      TEST_USER.userId,
      'post',
      'post-1',
      7,
      35,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
  });

  it.each([
    ['a story, which no feed shows as promoted', { targetType: 'story' }],
    ['a Profile, which no feed shows as promoted', { targetType: 'profile' }],
    ['a budget above the most a promotion may cost', { budget: 1500.01 }],
    ['a budget under one euro', { budget: 0.5 }],
    ['a negative budget', { budget: -10 }],
    ['a budget with fractions of a cent', { budget: 10.001 }],
    ['a budget per day above the range', { dailyBudget: 51 }],
    ['a budget per day under the range', { dailyBudget: 4 }],
    ['more days than a promotion may last', { durationDays: 31 }],
    ['no days', { durationDays: 0 }],
    ['a part of a day', { durationDays: 1.5 }],
    ['a currency other than the euro', { currency: 'USD' }],
    ['a field the route does not know', { unitAmount: 1 }],
  ])('refuses a promotion with %s', async (_what, change) => {
    mockCreatePromotionUC.execute.mockClear();

    await request(app.getHttpServer())
      .post('/api/v1/creator/promotions')
      .set(BEARER)
      .send({
        targetType: 'post',
        targetId: 'post-1',
        budget: 35,
        durationDays: 7,
        ...change,
      })
      .expect(400);

    expect(mockCreatePromotionUC.execute).not.toHaveBeenCalled();
  });

  it('takes a budget per day in place of the whole budget', async () => {
    mockCreatePromotionUC.execute.mockClear();
    mockCreatePromotionUC.execute.mockResolvedValue({ id: 'promo-2' });

    await request(app.getHttpServer())
      .post('/api/v1/creator/promotions')
      .set(BEARER)
      .send({
        targetType: 'frame',
        targetId: 'post-1',
        dailyBudget: 50,
        durationDays: 30,
        currency: 'eur',
      })
      .expect(201);

    expect(mockCreatePromotionUC.execute).toHaveBeenCalledWith(
      TEST_USER.userId,
      'frame',
      'post-1',
      30,
      undefined,
      'EUR',
      undefined,
      undefined,
      undefined,
      50,
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

  it('reads revenue analytics by session userId, not profileId', async () => {
    // Regression test: Transaction.receiverId stores User.id, not Profile.id.
    // Passing profileId here previously made this endpoint always return 0.
    const revenue = { period: '30d', grossRevenue: 42.5 };
    mockGetRevenueAnalyticsQ.execute.mockResolvedValue(revenue);

    const res = await request(app.getHttpServer())
      .get('/api/v1/creator/analytics/revenue')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual(revenue);
    expect(mockGetRevenueAnalyticsQ.execute).toHaveBeenCalledWith(
      TEST_USER.userId,
      undefined,
    );
  });

  it('exports the analytics CSV with both userId (revenue) and profileId (retention)', async () => {
    mockExportAnalyticsCsvUC.execute.mockResolvedValue('Metric,Value\n');

    await request(app.getHttpServer())
      .get('/api/v1/creator/analytics/export')
      .set(BEARER)
      .expect(200);

    expect(mockExportAnalyticsCsvUC.execute).toHaveBeenCalledWith(
      TEST_USER.userId,
      TEST_USER.profileId,
      '30d',
    );
  });

  it('cancels a promotion as the session userId', async () => {
    const cancelled = { id: 'promo-1', status: 'CANCELLED' };
    mockManagePromotionUC.cancelPromotion.mockResolvedValue(cancelled);

    const res = await request(app.getHttpServer())
      .delete('/api/v1/creator/promotions/promo-1')
      .set(BEARER)
      .expect(200);

    expect(res.body).toEqual(cancelled);
    expect(mockManagePromotionUC.cancelPromotion).toHaveBeenCalledWith(
      TEST_USER.userId,
      'promo-1',
    );
  });
});
