import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
        totalEarningsCents: 5000,
      });
      mockPrismaService.user.findUnique.mockResolvedValue({
        stripeConnectAccountId: 'acct_123',
      });

      const result = await service.getMonetization('user-1');
      expect(result).toHaveProperty('hasStripeAccount', true);
      expect(result.totalEarningsCents).toBe(5000);
    });

    it('should create monetization record if none exists', async () => {
      mockPrismaService.monetization.findUnique.mockResolvedValue(null);
      mockPrismaService.monetization.create.mockResolvedValue({
        userId: 'user-2',
        totalEarningsCents: 0,
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
        service.createPostUnlockSession('user-1', 'post-1', 'http://localhost/return'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if buyer is buying own post', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        isPremium: true,
        priceCents: 500,
        userId: 'user-1',
      });

      await expect(
        service.createPostUnlockSession('user-1', 'post-1', 'http://localhost/return'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('createTipSession', () => {
    it('should throw if amount is less than 100 cents', async () => {
      await expect(
        service.createTipSession('user-1', 'creator-1', 50, 'http://localhost/return'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if tipping yourself', async () => {
      await expect(
        service.createTipSession('user-1', 'user-1', 500, 'http://localhost/return'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
