import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createSubscriptionSession', () => {
    it('should throw BadRequestException if subscribing to self', async () => {
      await expect(
        service.createSubscriptionSession(
          'user-1',
          'user-1',
          500,
          'https://example.com',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if price is below minimum', async () => {
      await expect(
        service.createSubscriptionSession(
          'user-1',
          'creator-1',
          50,
          'https://example.com',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should upsert subscription in non-production environments', async () => {
      mockPrismaService.creatorSubscription.upsert.mockResolvedValue({
        id: 'sub-1',
        subscriberId: 'user-1',
        creatorId: 'creator-1',
        status: 'ACTIVE',
      });

      const result = await service.createSubscriptionSession(
        'user-1',
        'creator-1',
        500,
        'https://example.com',
      );

      expect(mockPrismaService.creatorSubscription.upsert).toHaveBeenCalled();
      expect(result).toEqual({ url: null, success: true });
    });
  });
});
