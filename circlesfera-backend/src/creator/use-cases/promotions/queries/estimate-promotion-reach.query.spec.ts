import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EstimatePromotionReachQuery } from './estimate-promotion-reach.query.js';

describe('EstimatePromotionReachQuery', () => {
  const prisma = { $queryRaw: vi.fn() };
  const cache = { get: vi.fn(), set: vi.fn() };
  const query = new EstimatePromotionReachQuery(
    prisma as never,
    cache as never,
  );

  beforeEach(() => {
    prisma.$queryRaw.mockReset();
    cache.get.mockReset();
    cache.set.mockReset();
  });

  it('counts the people by country once, keeps the count an hour, and adds the countries chosen', async () => {
    cache.get.mockResolvedValue(undefined);
    prisma.$queryRaw.mockResolvedValue([
      { country: 'ES', people: 3000n },
      { country: 'MX', people: 1500 },
      { country: null, people: 700 },
    ]);

    await expect(query.execute(5, 7, ['ES', 'MX'])).resolves.toEqual({
      low: 500,
      high: 3500,
    });
    expect(cache.set).toHaveBeenCalledWith(
      'promotions:audience-by-country',
      { ES: 3000, MX: 1500, '': 700 },
      3_600_000,
    );
    // The count leaves out Test Accounts and people whose plan has no
    // promoted posts, as the feed does.
    const sql = prisma.$queryRaw.mock.calls[0][0].join('');
    expect(sql).toContain('"isTestAccount" = false');
    expect(sql).toContain("'no_promoted_content' = ANY");
  });

  it('reads the kept count instead of counting again', async () => {
    cache.get.mockResolvedValue({ ES: 3000, MX: 1500, '': 1200 });

    // Everywhere: people with no known country included.
    await expect(query.execute(50, 30)).resolves.toEqual({
      low: 5000,
      high: 5700,
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('gives no number for countries with few people, and never the count itself', async () => {
    cache.get.mockResolvedValue({ ES: 3000, AD: 2 });

    const result = await query.execute(5, 7, ['AD']);

    expect(result).toEqual({ low: null, high: null });
    expect(result).not.toHaveProperty('audience');
  });

  it('never lets a small country change the number, alone or added to others', async () => {
    cache.get.mockResolvedValue({ FR: 990, AD: 12, ES: 1990, '': 30 });

    // FR under the minimum and AD added: still no number.
    await expect(query.execute(50, 30, ['FR', 'AD'])).resolves.toEqual({
      low: null,
      high: null,
    });
    // ES with or without AD: the same number.
    const withoutAd = await query.execute(50, 30, ['ES']);
    const withAd = await query.execute(50, 30, ['ES', 'AD']);
    expect(withAd).toEqual(withoutAd);
    // Everywhere counts only the countries over the minimum.
    await expect(query.execute(50, 30)).resolves.toEqual(withoutAd);
  });
});
