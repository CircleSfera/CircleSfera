import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EstimatePromotionReachQuery } from './estimate-promotion-reach.query.js';

describe('EstimatePromotionReachQuery', () => {
  const prisma = { user: { count: vi.fn() } };
  const query = new EstimatePromotionReachQuery(prisma as never);

  beforeEach(() => {
    prisma.user.count.mockReset();
  });

  it('counts the active people in the countries, never the buyer, and turns the budget into a range', async () => {
    prisma.user.count.mockResolvedValue(2000);

    const result = await query.execute('buyer', 5, 7, ['ES']);

    expect(result).toEqual({ low: 500, high: 2000, audience: 2000 });
    const where = prisma.user.count.mock.calls[0][0].where;
    expect(where).toMatchObject({
      id: { not: 'buyer' },
      isActive: true,
      lastSeenAt: { gte: expect.any(Date) },
    });
    // The country in settings first, the one at sign-up only without it.
    expect(where.OR).toEqual([
      { settings: { country: { in: ['ES'] } } },
      {
        signupCountry: { in: ['ES'] },
        OR: [{ settings: null }, { settings: { country: null } }],
      },
    ]);
  });

  it('counts everyone active when aimed at no country', async () => {
    prisma.user.count.mockResolvedValue(10);

    await query.execute('buyer', 10, 3);

    expect(prisma.user.count.mock.calls[0][0].where).not.toHaveProperty('OR');
  });
});
