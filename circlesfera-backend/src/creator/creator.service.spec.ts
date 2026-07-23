import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatorService } from './creator.service.js';

describe('CreatorService', () => {
  let service: CreatorService;

  const mockPrismaService = {
    post: {
      count: vi.fn(),
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
    story: {
      count: vi.fn(),
    },
    storyView: {
      count: vi.fn(),
    },
    follow: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    like: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    comment: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    bookmark: {
      count: vi.fn(),
    },
    promotion: {
      count: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      $queryRaw: undefined,
    },
    $transaction: vi.fn((cb) =>
      cb({
        $queryRaw: mockPrismaService.$queryRaw,
        promotion: mockPrismaService.promotion,
      }),
    ),
    $queryRaw: vi.fn(),
    transaction: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    creatorSubscription: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    interactionEvent: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  };

  const mockAnalyticsService = {
    trackEvent: vi.fn(),
  };

  const mockStripeService = {
    createAccountLink: vi.fn(),
    createRefundFromCheckoutSession: vi.fn(),
    expireCheckoutSession: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreatorService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: StripeService, useValue: mockStripeService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<CreatorService>(CreatorService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getStats', () => {
    it('should return aggregated creator statistics', async () => {
      mockPrismaService.post.count.mockResolvedValue(10);
      mockPrismaService.story.count.mockResolvedValue(5);
      mockPrismaService.storyView.count.mockResolvedValue(150);
      mockPrismaService.follow.count.mockResolvedValue(100);
      mockPrismaService.follow.findMany.mockResolvedValue([]);
      mockPrismaService.like.count.mockResolvedValue(500);
      mockPrismaService.like.findMany.mockResolvedValue([]);
      mockPrismaService.comment.count.mockResolvedValue(50);
      mockPrismaService.bookmark.count.mockResolvedValue(20);
      mockPrismaService.promotion.count.mockResolvedValue(2);
      mockPrismaService.creatorSubscription.findMany.mockResolvedValue([]);
      mockPrismaService.post.aggregate.mockResolvedValue({
        _sum: { views: 2000 },
      });

      const stats = await service.getStats('creator-1');
      expect(stats).toHaveProperty('postCount');
      expect(stats).toHaveProperty('followerCount');
      expect(stats).toHaveProperty('totalReach');
    });
  });

  describe('advanced analytics', () => {
    it('should return revenue analytics breakdown', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([
        { type: 'STRIPE_SUBSCRIPTION', amount: 5000 },
        { type: 'DIRECT_TIP', amount: 2000 },
      ]);
      mockPrismaService.creatorSubscription.count.mockResolvedValue(5);
      mockPrismaService.follow.count.mockResolvedValue(50);

      const res = await service.getRevenueAnalytics('creator-1', '30d');
      expect(res.grossRevenue).toBe(70);
      expect(res.conversionRate).toBe(10);
      expect(res.currency).toBe('EUR');
    });

    it('should return audience retention analytics', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([{ id: 'p1' }]);
      mockPrismaService.interactionEvent.findMany.mockResolvedValue([
        { dwellTime: 12, createdAt: new Date(2026, 0, 1, 14, 0, 0) },
        { dwellTime: 18, createdAt: new Date(2026, 0, 1, 14, 30, 0) },
      ]);

      const res = await service.getAudienceRetentionAnalytics('creator-1');
      expect(res.avgDwellSeconds).toBe(15);
      expect(res.peakActivityHourUTC).toBe(14);
    });

    it('should export CSV analytics report', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([]);
      mockPrismaService.creatorSubscription.count.mockResolvedValue(0);
      mockPrismaService.follow.count.mockResolvedValue(0);
      mockPrismaService.post.findMany.mockResolvedValue([]);

      const csv = await service.exportAnalyticsCsv('creator-1', '30d');
      expect(csv).toContain('Metric,Value,Unit/Currency');
      expect(csv).toContain('Gross Revenue,0.00,EUR');
    });
  });

  describe('promotion lifecycle', () => {
    const future = new Date(Date.now() + 7 * 86_400_000);

    it('should pause an active promotion without refunding', async () => {
      mockPrismaService.promotion.findFirst.mockResolvedValue({
        id: 'promo-1',
        userId: 'creator-1',
        status: 'ACTIVE',
        endDate: future,
        budget: 10,
      });
      mockPrismaService.promotion.update.mockResolvedValue({
        id: 'promo-1',
        status: 'PAUSED',
      });

      const result = await service.pausePromotion('creator-1', 'promo-1');
      expect(result.status).toBe('PAUSED');
      expect(
        mockStripeService.createRefundFromCheckoutSession,
      ).not.toHaveBeenCalled();
    });

    it('should resume a paused promotion', async () => {
      mockPrismaService.promotion.findFirst.mockResolvedValue({
        id: 'promo-1',
        userId: 'creator-1',
        status: 'PAUSED',
        endDate: future,
        budget: 5,
      });
      mockPrismaService.promotion.update.mockResolvedValue({
        id: 'promo-1',
        status: 'ACTIVE',
      });

      const result = await service.resumePromotion('creator-1', 'promo-1');
      expect(result.status).toBe('ACTIVE');
    });

    it('should cancel with proportional Stripe refund of remaining budget', async () => {
      mockPrismaService.promotion.findFirst.mockResolvedValue({
        id: 'promo-1',
        userId: 'creator-1',
        status: 'ACTIVE',
        endDate: future,
        budget: 4.5,
        currency: 'EUR',
        refundPolicy: 'PROPORTIONAL',
        refundedAt: null,
        chargedAt: new Date(),
        stripePaymentIntentId: 'cs_test_1',
      });
      mockStripeService.createRefundFromCheckoutSession.mockResolvedValue({
        id: 're_1',
        amount: 450,
        currency: 'eur',
      });
      mockPrismaService.promotion.update.mockResolvedValue({
        id: 'promo-1',
        status: 'CANCELLED',
        refundedAt: new Date(),
        currency: 'EUR',
      });

      const result = await service.cancelPromotion('creator-1', 'promo-1');
      expect(
        mockStripeService.createRefundFromCheckoutSession,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          checkoutSessionId: 'cs_test_1',
          amountInCents: 450,
          idempotencyKey: 'promotion-cancel-refund-promo-1',
        }),
      );
      expect(result.refund?.status).toBe('succeeded');
      expect(result.refund?.amount).toBe(4.5);
      expect(mockPrismaService.promotion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CANCELLED',
            refundedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should not refund when refundPolicy is NONE', async () => {
      mockPrismaService.promotion.findFirst.mockResolvedValue({
        id: 'promo-2',
        userId: 'creator-1',
        status: 'ACTIVE',
        endDate: future,
        budget: 8,
        currency: 'EUR',
        refundPolicy: 'NONE',
        refundedAt: null,
        chargedAt: new Date(),
        stripePaymentIntentId: 'cs_test_2',
      });
      mockPrismaService.promotion.update.mockResolvedValue({
        id: 'promo-2',
        status: 'CANCELLED',
        currency: 'EUR',
      });

      const result = await service.cancelPromotion('creator-1', 'promo-2');
      expect(
        mockStripeService.createRefundFromCheckoutSession,
      ).not.toHaveBeenCalled();
      expect(result.refund?.status).toBe('skipped_policy');
    });

    it('should reject promotion view from the campaign owner', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        {
          id: 'promo-1',
          budget: 5,
          userId: 'creator-1',
          status: 'ACTIVE',
        },
      ]);

      const result = await service.recordPromotionView('promo-1', 'creator-1');
      expect(result).toEqual({ success: false });
      expect(mockPrismaService.promotion.update).not.toHaveBeenCalled();
    });

    it('should record promotion view for a non-owner viewer', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([
        {
          id: 'promo-1',
          budget: 5,
          userId: 'creator-1',
          status: 'ACTIVE',
        },
      ]);
      mockPrismaService.promotion.update.mockResolvedValue({});

      const result = await service.recordPromotionView('promo-1', 'viewer-2');
      expect(result).toEqual({ success: true });
      expect(mockPrismaService.promotion.update).toHaveBeenCalled();
    });
  });
});
