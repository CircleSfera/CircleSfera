import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatorSubscriptionsService } from './creator-subscriptions.service.js';

describe('CreatorSubscriptionsService', () => {
  let service: CreatorSubscriptionsService;

  const mockPrismaService = {
    creatorSubscription: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    profile: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  const mockStripeService = {
    createCheckoutSession: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreatorSubscriptionsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StripeService, useValue: mockStripeService },
      ],
    }).compile();

    service = module.get<CreatorSubscriptionsService>(
      CreatorSubscriptionsService,
    );
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createSubscriptionSession', () => {
    it('should throw BadRequestException if subscribing to self', async () => {
      await expect(
        service.createSubscriptionSession(
          'user-1',
          'user-1',
          'https://example.com',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if creator has no subscription price', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue({
        subscriptionPriceCents: null,
        username: 'creator',
      });

      await expect(
        service.createSubscriptionSession(
          'user-1',
          'creator-1',
          'https://example.com',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should use server-side price and ignore client amounts', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      mockPrismaService.profile.findUnique.mockResolvedValue({
        subscriptionPriceCents: 999,
        username: 'creator',
      });
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce({
          id: 'creator-1',
          stripeConnectAccountId: 'acct_1',
          email: 'c@example.com',
        })
        .mockResolvedValueOnce({
          id: 'user-1',
          email: 'u@example.com',
        });
      mockPrismaService.creatorSubscription.findUnique.mockResolvedValue(null);
      mockStripeService.createCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.com/test',
      });

      const result = await service.createSubscriptionSession(
        'user-1',
        'creator-1',
        'https://example.com',
      );

      expect(result.url).toBe('https://checkout.stripe.com/test');
      expect(mockStripeService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({ unit_amount: 999 }),
            }),
          ],
          metadata: expect.objectContaining({ priceCents: '999' }),
        }),
      );
    });

    it('should upsert subscription only when ALLOW_DEV_CREATOR_SUBS=true', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('ALLOW_DEV_CREATOR_SUBS', 'true');
      mockPrismaService.profile.findUnique.mockResolvedValue({
        subscriptionPriceCents: 500,
        username: 'creator',
      });
      mockPrismaService.creatorSubscription.upsert.mockResolvedValue({
        id: 'sub-1',
        status: 'ACTIVE',
      });

      const result = await service.createSubscriptionSession(
        'user-1',
        'creator-1',
        'https://example.com',
      );

      expect(result).toEqual({ url: null, success: true });
      expect(mockPrismaService.creatorSubscription.upsert).toHaveBeenCalled();
    });
  });
});
