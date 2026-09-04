import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../analytics/analytics.service.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { SubscriptionGuard } from '../auth/guards/subscription.guard.js';
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
  let controller: CreatorController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'creator@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const req = { user: mockUser } as Parameters<
    CreatorController['getStats']
  >[0];

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SubscriptionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CreatorController>(CreatorController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getStats', () => {
    it('delegates to GetCreatorStatsQuery with profileId', async () => {
      const stats = { followers: 100, revenueCents: 5000 };
      mockGetCreatorStatsQ.execute.mockResolvedValue(stats);

      const result = await controller.getStats(req);

      expect(mockGetCreatorStatsQ.execute).toHaveBeenCalledWith('profile-1');
      expect(result).toEqual(stats);
    });
  });

  describe('getActivityChart', () => {
    it('returns daily metrics from analytics dashboard', async () => {
      const dailyMetrics = [{ date: '2026-01-01', views: 10 }];
      mockAnalyticsService.getCreatorDashboard.mockResolvedValue({
        charts: { dailyMetrics },
      });

      const result = await controller.getActivityChart(req);

      expect(mockAnalyticsService.getCreatorDashboard).toHaveBeenCalledWith(
        'profile-1',
        14,
      );
      expect(result).toEqual(dailyMetrics);
    });
  });

  describe('getPosts', () => {
    it('delegates with parsed pagination defaults', async () => {
      mockGetCreatorPostsQ.execute.mockResolvedValue({ items: [] });

      await controller.getPosts(req);

      expect(mockGetCreatorPostsQ.execute).toHaveBeenCalledWith(
        'profile-1',
        1,
        10,
        undefined,
      );
    });

    it('passes query params when provided', async () => {
      mockGetCreatorPostsQ.execute.mockResolvedValue({ items: [] });

      await controller.getPosts(req, '2', '20', 'FRAME');

      expect(mockGetCreatorPostsQ.execute).toHaveBeenCalledWith(
        'profile-1',
        2,
        20,
        'FRAME',
      );
    });
  });

  describe('createPromotion', () => {
    it('throws BadRequestException when required fields missing', async () => {
      await expect(
        controller.createPromotion(req, {
          targetType: 'POST',
          targetId: 'post-1',
          durationDays: 7,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('delegates to CreatePromotionUseCase when valid', async () => {
      mockCreatePromotionUC.execute.mockResolvedValue({ id: 'promo-1' });

      const result = await controller.createPromotion(req, {
        targetType: 'POST',
        targetId: 'post-1',
        budget: 1000,
        durationDays: 7,
      });

      expect(mockCreatePromotionUC.execute).toHaveBeenCalledWith(
        'user-1',
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
      expect(result).toEqual({ id: 'promo-1' });
    });
  });

  describe('recordPromotionView', () => {
    it('delegates to recordView with userId', async () => {
      mockRecordPromotionInteractionUC.recordView.mockResolvedValue({
        success: true,
      });

      const result = await controller.recordPromotionView(req, 'promo-1');

      expect(mockRecordPromotionInteractionUC.recordView).toHaveBeenCalledWith(
        'promo-1',
        'user-1',
      );
      expect(result).toEqual({ success: true });
    });
  });
});
