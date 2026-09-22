import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { GetRevenueAnalyticsQuery } from './get-revenue-analytics.query.js';

describe('GetRevenueAnalyticsQuery', () => {
  let query: GetRevenueAnalyticsQuery;

  const mockPrismaService = {
    transaction: { findMany: vi.fn() },
    follow: { count: vi.fn() },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetRevenueAnalyticsQuery,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    query = module.get<GetRevenueAnalyticsQuery>(GetRevenueAnalyticsQuery);
    vi.clearAllMocks();
  });

  it('filters Transaction by the given id as receiverId (User.id, not Profile.id)', async () => {
    // Regression test: Transaction.receiverId is a FK to User.id. Calling
    // this with a Profile.id (as creator.controller.ts once did) silently
    // matches zero rows and always returns a 0 gross revenue.
    mockPrismaService.transaction.findMany.mockResolvedValue([]);
    mockPrismaService.follow.count.mockResolvedValue(0);

    await query.execute('user-42', '30d');

    expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ receiverId: 'user-42' }),
      }),
    );
  });

  it('sums completed transactions into the correct revenue bucket by type', async () => {
    mockPrismaService.transaction.findMany.mockResolvedValue([
      { type: 'DIRECT_TIP', amount: 500 },
      { type: 'DIRECT_POST_UNLOCK', amount: 300 },
      { type: 'DIRECT_STORY_UNLOCK', amount: 200 },
      { type: 'DIRECT_LIVE_GIFT', amount: 100 },
      { type: 'STRIPE_SUBSCRIPTION', amount: 1000 },
    ]);
    mockPrismaService.follow.count.mockResolvedValue(10);

    const result = await query.execute('user-42', '7d');

    expect(result).toMatchObject({
      subscriptionsTotal: 10,
      tipsTotal: 5,
      postUnlocksTotal: 5,
      giftsTotal: 1,
      grossRevenue: 21,
      currency: 'EUR',
    });
  });
});
