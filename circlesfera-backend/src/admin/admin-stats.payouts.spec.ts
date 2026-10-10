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
