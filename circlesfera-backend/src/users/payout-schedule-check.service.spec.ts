import { describe, expect, it, vi } from 'vitest';
import { PayoutScheduleCheckService } from './payout-schedule-check.service.js';

const now = new Date('2026-10-29T05:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
const person = (
  id: string,
  isRootBanned: boolean,
  payoutsHeldAt: Date | null = null,
) => ({ id, isRootBanned, payoutsHeldAt });

describe('PayoutScheduleCheckService', () => {
  const setup = (
    rows: object[],
    intervals: Record<string, string | Error>,
    owners: object[] = [],
  ) => {
    const prisma = {
      monetization: { findMany: vi.fn().mockResolvedValue(rows) },
      user: {
        findMany: vi.fn().mockResolvedValue(owners),
        update: vi.fn(),
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
    return { service, prisma, stripe, events };
  };
  const row = (account: string, owner: object, viaProfile = false) =>
    viaProfile
      ? {
          stripeConnectAccountId: account,
          user: null,
          profile: { user: owner },
        }
      : { stripeConnectAccountId: account, user: owner, profile: null };

  it('holds the payouts of banned people and resumes those of everyone else, as needed', async () => {
    const { service, stripe, events } = setup(
      [
        row('acct_banned', person('u1', true, daysAgo(3))),
        row('acct_lifted', person('u2', false), true),
        row('acct_fine', person('u3', false)),
        { stripeConnectAccountId: 'acct_orphan', user: null, profile: null },
      ],
      {
        acct_banned: 'weekly',
        acct_lifted: 'manual',
        acct_fine: 'weekly',
        acct_column: 'weekly',
      },
      [
        {
          ...person('u4', true, daysAgo(1)),
          stripeConnectAccountId: 'acct_column',
        },
      ],
    );

    await expect(service.checkSchedules(now)).resolves.toEqual({
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

  it('starts the count today for a person banned before payouts were held, once for all their accounts', async () => {
    const banned = person('u1', true, null);
    const { service, prisma, stripe } = setup(
      [row('acct_a', { ...banned }), row('acct_b', { ...banned }, true)],
      { acct_a: 'weekly', acct_b: 'weekly' },
    );

    await service.checkSchedules(now);

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { payoutsHeldAt: now },
    });
    expect(stripe.setPayoutsHeld).toHaveBeenCalledWith('acct_a', true);
    expect(stripe.setPayoutsHeld).toHaveBeenCalledWith('acct_b', true);
  });

  it('tells the team ten days before the held payouts are released', async () => {
    const { service, events } = setup(
      [
        row('acct_75', person('u75', true, daysAgo(75))),
        row('acct_74', person('u74', true, daysAgo(74))),
      ],
      { acct_75: 'manual', acct_74: 'manual' },
    );

    await service.checkSchedules(now);

    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(
      'system.incident',
      expect.objectContaining({
        message:
          'The held payouts of 1 banned person(s) are released in 10 days: u75. Refund in Stripe what fraud paid before then.',
      }),
    );
  });

  it('releases the payouts of a person still banned after 85 days', async () => {
    const { service, stripe } = setup(
      [
        row('acct_85', person('u85', true, daysAgo(85))),
        row('acct_84', person('u84', true, daysAgo(84))),
      ],
      { acct_85: 'manual', acct_84: 'manual' },
    );

    await expect(service.checkSchedules(now)).resolves.toEqual({
      corrected: ['acct_85'],
      failed: [],
    });
    expect(stripe.setPayoutsHeld).toHaveBeenCalledWith('acct_85', false);
  });

  it('tells the team of the accounts it could not check, and checks the rest', async () => {
    const { service, stripe, events } = setup(
      [
        row('acct_banned', person('u1', true, daysAgo(2))),
        row('acct_lifted', person('u2', false)),
      ],
      { acct_banned: new Error('down'), acct_lifted: 'manual' },
    );

    await expect(service.checkSchedules(now)).resolves.toEqual({
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
