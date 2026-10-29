import { describe, expect, it, vi } from 'vitest';
import { PayoutScheduleCheckService } from './payout-schedule-check.service.js';

describe('PayoutScheduleCheckService', () => {
  const setup = (intervals: Record<string, string | Error>) => {
    const prisma = {
      monetization: {
        findMany: vi.fn().mockResolvedValue([
          // A banned person's row, still paid out on Mondays.
          {
            stripeConnectAccountId: 'acct_banned',
            user: { isRootBanned: true },
            profile: null,
          },
          // A Profile's own row of a person in good standing, still held.
          {
            stripeConnectAccountId: 'acct_lifted',
            user: null,
            profile: { user: { isRootBanned: false } },
          },
          // Already as it should be.
          {
            stripeConnectAccountId: 'acct_fine',
            user: { isRootBanned: false },
            profile: null,
          },
          // A row whose Profile and person are gone.
          { stripeConnectAccountId: 'acct_orphan', user: null, profile: null },
        ]),
      },
      user: {
        findMany: vi.fn().mockResolvedValue([
          // Only on the person's column.
          { stripeConnectAccountId: 'acct_column', isRootBanned: true },
        ]),
      },
    };
    const stripe = {
      getAccount: vi.fn(async (account: string) => {
        const interval = intervals[account];
        if (interval instanceof Error) throw interval;
        return { settings: { payouts: { schedule: { interval } } } };
      }),
      setPayoutsHeld: vi.fn(),
    };
    const events = { emit: vi.fn() };
    const service = new PayoutScheduleCheckService(
      prisma as never,
      stripe as never,
      events as never,
    );
    return { service, stripe, events };
  };

  it('holds the payouts of banned people and resumes those of everyone else, as needed', async () => {
    const { service, stripe, events } = setup({
      acct_banned: 'weekly',
      acct_lifted: 'manual',
      acct_fine: 'weekly',
      acct_column: 'weekly',
    });

    await expect(service.checkSchedules()).resolves.toEqual({
      corrected: ['acct_column', 'acct_banned', 'acct_lifted'],
      failed: [],
    });
    expect(stripe.setPayoutsHeld).toHaveBeenCalledWith('acct_banned', true);
    expect(stripe.setPayoutsHeld).toHaveBeenCalledWith('acct_lifted', false);
    expect(stripe.setPayoutsHeld).toHaveBeenCalledWith('acct_column', true);
    expect(stripe.setPayoutsHeld).toHaveBeenCalledTimes(3);
    expect(stripe.getAccount).not.toHaveBeenCalledWith('acct_orphan');
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('tells the team of the accounts it could not check, and checks the rest', async () => {
    const { service, stripe, events } = setup({
      acct_banned: new Error('down'),
      acct_lifted: 'manual',
      acct_fine: 'weekly',
      acct_column: 'manual',
    });

    await expect(service.checkSchedules()).resolves.toEqual({
      corrected: ['acct_lifted'],
      failed: ['acct_banned'],
    });
    expect(stripe.setPayoutsHeld).toHaveBeenCalledWith('acct_lifted', false);
    expect(events.emit).toHaveBeenCalledWith(
      'system.incident',
      expect.objectContaining({
        message:
          'The payout schedule of 1 creator account(s) could not be checked: acct_banned',
        path: 'stripe://payout-schedule',
      }),
    );
  });
});
