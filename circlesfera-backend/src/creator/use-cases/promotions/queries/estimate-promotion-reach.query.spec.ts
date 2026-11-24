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

  it('counts the people by country exactly, keeps the count ten minutes, and adds the countries chosen', async () => {
    cache.get.mockResolvedValue(undefined);
    prisma.$queryRaw.mockResolvedValue([
      { country: 'ES', people: 3487n },
      { country: 'MX', people: 1503 },
      { country: null, people: 700 },
    ]);

    await expect(query.execute(5, 7, ['ES', 'MX'])).resolves.toEqual({
      people: 4990,
      maxShows: 3500,
    });
    expect(cache.set).toHaveBeenCalledWith(
      'promotions:audience-by-country',
      { ES: 3487, MX: 1503, '': 700 },
      600_000,
    );
    // The count leaves out Test Accounts and people whose plan has no
    // promoted posts, as the feed does.
    const sql = prisma.$queryRaw.mock.calls[0][0].join('');
    expect(sql).toContain('"isTestAccount" = false');
    expect(sql).toContain("'no_promoted_content' = ANY");
  });

  it('reads the kept count instead of counting again; everywhere counts everyone', async () => {
    cache.get.mockResolvedValue({ ES: 3487, MX: 1503, '': 700 });

    await expect(query.execute(50, 30)).resolves.toEqual({
      people: 5690,
      maxShows: 150_000,
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('gives no number of people when a chosen country has few people, and still the most shows', async () => {
    cache.get.mockResolvedValue({ ES: 3487, AD: 2 });

    await expect(query.execute(5, 7, ['AD'])).resolves.toEqual({
      people: null,
      maxShows: 3500,
    });
    await expect(query.execute(5, 7, ['ES', 'AD'])).resolves.toEqual({
      people: null,
      maxShows: 3500,
    });
    await expect(query.execute(5, 7, ['ES'])).resolves.toEqual({
      people: 3487,
      maxShows: 3500,
    });
  });
});
