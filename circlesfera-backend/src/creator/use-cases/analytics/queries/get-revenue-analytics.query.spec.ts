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

    await query.execute('user-42', 'profile-42', '30d');

    expect(mockPrismaService.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ receiverId: 'user-42' }),
      }),
    );
  });

  it('sums completed transactions without their VAT into the correct revenue bucket by type', async () => {
    mockPrismaService.transaction.findMany.mockResolvedValue([
      // What was paid and the VAT inside it: income is the rest.
      { type: 'DIRECT_TIP', amount: 605, vatCents: 105 },
      { type: 'DIRECT_POST_UNLOCK', amount: 300, vatCents: 0 },
      { type: 'DIRECT_STORY_UNLOCK', amount: 200, vatCents: 0 },
      { type: 'DIRECT_MESSAGE_UNLOCK', amount: 250, vatCents: 0 },
      { type: 'DIRECT_LIVE_GIFT', amount: 121, vatCents: 21 },
      { type: 'DIRECT_TIP', amount: 10, vatCents: 0 },
      { type: 'DIRECT_TIP', amount: 20, vatCents: 0 },
    ]);
    mockPrismaService.follow.count.mockResolvedValue(10);

    const result = await query.execute('user-42', 'profile-42', '7d');

    expect(result).toEqual({
      period: '7d',
      tipsTotal: 5.3,
      postUnlocksTotal: 5,
      messageUnlocksTotal: 2.5,
      giftsTotal: 1,
      // Summed in cents: no floating error in the total.
      grossRevenue: 13.8,
      totalFollowersCount: 10,
      currency: 'EUR',
    });
  });

  it('counts the followers of the Profile, by Profile.id', async () => {
    mockPrismaService.transaction.findMany.mockResolvedValue([]);
    mockPrismaService.follow.count.mockResolvedValue(3);

    await query.execute('user-42', 'profile-42', '30d');

    expect(mockPrismaService.follow.count).toHaveBeenCalledWith({
      where: { followingId: 'profile-42', status: 'ACCEPTED' },
    });
  });
});
