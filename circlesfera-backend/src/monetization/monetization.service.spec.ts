import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MIN_PPV_PRICE_CENTS,
  PLATFORM_FEE_DECIMAL,
} from '../common/constants/monetization.constants.js';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MonetizationService } from './monetization.service.js';

describe('MonetizationService', () => {
  let service: MonetizationService;

  const mockPrismaService = {
    monetization: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    post: {
      findUnique: vi.fn(),
    },
  };

  const mockStripeService = {
    createCheckoutSession: vi.fn(),
    createExpressAccount: vi.fn(),
    createAccountLink: vi.fn(),
    getAccount: vi.fn(),
    createLoginLink: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonetizationService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StripeService, useValue: mockStripeService },
      ],
    }).compile();

    service = module.get<MonetizationService>(MonetizationService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMonetization', () => {
    it('should return monetization and stripe status when record exists', async () => {
      mockPrismaService.monetization.findUnique.mockResolvedValue({
        userId: 'user-1',
        lifetimeEarningsCents: 5000,
      });
      mockPrismaService.user.findUnique.mockResolvedValue({
        stripeConnectAccountId: 'acct_123',
      });

      const result = await service.getMonetization('user-1');
      expect(result).toHaveProperty('hasStripeAccount', true);
      expect(result.lifetimeEarningsCents).toBe(5000);
    });

    it('should create monetization record if none exists', async () => {
      mockPrismaService.monetization.findUnique.mockResolvedValue(null);
      mockPrismaService.monetization.create.mockResolvedValue({
        userId: 'user-2',
        lifetimeEarningsCents: 0,
      });
      mockPrismaService.user.findUnique.mockResolvedValue({
        stripeConnectAccountId: null,
      });

      const result = await service.getMonetization('user-2');
      expect(mockPrismaService.monetization.create).toHaveBeenCalledWith({
        data: { userId: 'user-2' },
      });
      expect(result).toHaveProperty('hasStripeAccount', false);
    });
  });

  describe('getFinancialSummary', () => {
    it('should return financial summary with revenue breakdown by category', async () => {
      mockPrismaService.transaction.aggregate
        .mockResolvedValueOnce({ _sum: { amount: 1500 } })
        .mockResolvedValueOnce({ _sum: { amount: 500 } });

      mockPrismaService.transaction.groupBy.mockResolvedValue([
        { type: 'DIRECT_POST_UNLOCK', _sum: { amount: 1000 } },
        { type: 'DIRECT_TIP', _sum: { amount: 500 } },
      ]);

      const summary = await service.getFinancialSummary('user-1');

      expect(summary.currentMonthIncome).toBe(1500);
      expect(summary.totalTips).toBe(500);
      expect(summary.breakdown).toEqual({
        postUnlocks: 1000,
        storyUnlocks: 0,
        messageUnlocks: 0,
        tips: 500,
        liveGifts: 0,
      });
    });
  });

  describe('getTransactions', () => {
    it('should return paginated transactions', async () => {
      mockPrismaService.transaction.findMany.mockResolvedValue([
        { id: 'tx-1', amountCents: 1000 },
      ]);
      mockPrismaService.transaction.count.mockResolvedValue(1);

      const result = await service.getTransactions('user-1', 1, 10);
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });
  });

  describe('createPostUnlockSession', () => {
    it('should throw if post is not premium', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        isPremium: false,
      });

      await expect(
        service.createPostUnlockSession(
          'user-1',
          'profile-1',
          'post-1',
          'http://localhost/return',
        ),
      ).rejects.toThrow();
    });

    it('should throw if buyer is buying own post', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        isPremium: true,
        priceCents: 500,
        profileId: 'profile-1',
      });

      await expect(
        service.createPostUnlockSession(
          'user-1',
          'profile-1',
          'post-1',
          'http://localhost/return',
        ),
      ).rejects.toThrow();
    });
  });

  describe('createTipSession', () => {
    const tipCents = MIN_PPV_PRICE_CENTS * 5;

    it('should throw if amount is less than the €1.00 minimum', async () => {
      await expect(
        service.createTipSession(
          'user-1',
          'creator-1',
          MIN_PPV_PRICE_CENTS - 1,
          'http://localhost/return',
        ),
      ).rejects.toThrow();
    });

    it('should throw if tipping yourself', async () => {
      await expect(
        service.createTipSession(
          'user-1',
          'user-1',
          tipCents,
          'http://localhost/return',
        ),
      ).rejects.toThrow();
    });

    it('creates Checkout with the requested amount and ADR-0010 fee', async () => {
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce({
          id: 'creator-1',
          email: 'creator@example.com',
          stripeConnectAccountId: 'acct_1',
        })
        .mockResolvedValueOnce({
          id: 'fan-1',
          email: 'fan@example.com',
        });
      mockStripeService.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.test/tip',
      });

      const result = await service.createTipSession(
        'fan-1',
        'creator-1',
        tipCents,
        'http://localhost/return',
      );

      expect(result.url).toBe('https://checkout.stripe.test/tip');
      expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({ unit_amount: tipCents }),
            }),
          ],
          payment_intent_data: expect.objectContaining({
            application_fee_amount: Math.floor(tipCents * PLATFORM_FEE_DECIMAL),
          }),
        }),
        expect.anything(),
      );
    });
  });

  describe('createPostUnlockSession fee', () => {
    it('charges the post priceCents and the ADR-0010 application fee', async () => {
      const priceCents = 999;
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        isPremium: true,
        priceCents,
        profileId: 'creator-profile',
        profile: {
          user: {
            id: 'creator-1',
            email: 'creator@example.com',
            stripeConnectAccountId: 'acct_1',
          },
        },
      });
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'fan-1',
        email: 'fan@example.com',
      });
      mockStripeService.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.test/unlock',
      });

      await service.createPostUnlockSession(
        'fan-1',
        'fan-profile',
        'post-1',
        'http://localhost/return',
      );

      expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({ unit_amount: priceCents }),
            }),
          ],
          payment_intent_data: expect.objectContaining({
            application_fee_amount: Math.floor(
              priceCents * PLATFORM_FEE_DECIMAL,
            ),
          }),
        }),
        expect.anything(),
      );
    });
  });
});
