import { describe, expect, it, vi } from 'vitest';
import { AdminStatsService } from './admin-stats.service.js';

// The payout figures of the staff screen: one count per state.
describe('AdminStatsService: payout figures', () => {
  const build = (groups: { status: string; _count: number }[]) => {
    const prisma = {
      stripePayoutLog: { groupBy: vi.fn().mockResolvedValue(groups) },
    };
    return new AdminStatsService(prisma as never, {} as never);
  };

  it('counts paid, pending and failed payouts, and the total', async () => {
    const service = build([
      { status: 'paid', _count: 7 },
      { status: 'pending', _count: 2 },
      { status: 'failed', _count: 1 },
      { status: 'canceled', _count: 3 },
      { status: 'in_transit', _count: 4 },
    ]);

    expect(await service.getPayoutStats()).toEqual({
      paid: 7,
      pending: 2,
      failed: 4,
      total: 17,
    });
  });

  it('answers zeros when there are no payouts', async () => {
    expect(await build([]).getPayoutStats()).toEqual({
      paid: 0,
      pending: 0,
      failed: 0,
      total: 0,
    });
  });
});

// The staff list of payouts: each shows the Profile whose payout account
// paid it out, as a person may have one for each earning Profile.
describe('AdminStatsService: payout list', () => {
  const build = (rows: object[]) => {
    const prisma = {
      stripePayoutLog: {
        findMany: vi.fn().mockResolvedValue(rows),
        count: vi.fn().mockResolvedValue(rows.length),
      },
    };
    return {
      prisma,
      service: new AdminStatsService(prisma as never, {} as never),
    };
  };

  it('names the Profile paid out beside the person, and finds a payout by either', async () => {
    const { prisma, service } = build([
      {
        id: 'po1',
        user: {
          id: 'u1',
          email: 'ana@example.com',
          profiles: [{ id: 'p-main', username: 'ana', createdAt: new Date(0) }],
        },
        profile: {
          id: 'p-shop',
          username: 'ana_shop',
          fullName: 'Ana Shop',
          avatar: null,
        },
      },
    ]);

    const res = await service.getPayouts(2, 10, 'paid', 'shop');

    const where = {
      status: 'paid',
      OR: [
        {
          user: {
            OR: [
              { email: { contains: 'shop', mode: 'insensitive' } },
              {
                profiles: {
                  some: { username: { contains: 'shop', mode: 'insensitive' } },
                },
              },
            ],
          },
        },
        { profile: { username: { contains: 'shop', mode: 'insensitive' } } },
      ],
    };
    expect(prisma.stripePayoutLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        skip: 10,
        take: 10,
        include: expect.objectContaining({
          profile: {
            select: { id: true, username: true, fullName: true, avatar: true },
          },
        }),
      }),
    );
    expect(prisma.stripePayoutLog.count).toHaveBeenCalledWith({ where });
    expect(res.data[0].profile).toEqual(
      expect.objectContaining({ username: 'ana_shop' }),
    );
    expect(res.meta).toEqual({ total: 1, page: 2, limit: 10 });
  });

  it('keeps a payout whose person was erased', async () => {
    const { service } = build([{ id: 'po2', user: null, profile: null }]);

    const res = await service.getPayouts();

    expect(res.data[0]).toEqual(
      expect.objectContaining({ id: 'po2', user: null, profile: null }),
    );
  });
});
