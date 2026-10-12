import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RecurringIncomeService,
  recurringIncomeCents,
} from './recurring-income.service.js';

describe('RecurringIncomeService', () => {
  const prisma = {
    platformSubscription: { findMany: vi.fn() },
    recurringIncomeDay: { upsert: vi.fn(), findMany: vi.fn() },
  };
  const service = new RecurringIncomeService(prisma as never);
  const plans = (...prices: (number | null)[]) =>
    prices.map((priceCents) => ({
      plan: priceCents === null ? null : { priceCents },
    }));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T23:59:30Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('adds the list price of the plan of each subscription, in whole cents', () => {
    expect(recurringIncomeCents(plans(999, 999, 2999))).toBe(4997);
    // A subscription whose plan is not known adds nothing.
    expect(recurringIncomeCents(plans(999, null))).toBe(999);
    expect(recurringIncomeCents([])).toBe(0);
  });

  it('counts the figure of now from the active subscriptions only', async () => {
    prisma.platformSubscription.findMany.mockResolvedValue(plans(999, 2999));

    await expect(service.current()).resolves.toEqual({
      mrrCents: 3998,
      activeSubscriptions: 2,
    });
    expect(prisma.platformSubscription.findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
      select: { plan: { select: { priceCents: true } } },
    });
  });

  it('keeps the figure under the day in UTC, one row per day', async () => {
    prisma.platformSubscription.findMany.mockResolvedValue(plans(999));

    await service.keepToday();

    const figure = { mrrCents: 999, activeSubscriptions: 1 };
    const day = new Date('2026-03-10T00:00:00.000Z');
    expect(prisma.recurringIncomeDay.upsert).toHaveBeenCalledWith({
      where: { day },
      create: { day, ...figure },
      update: figure,
    });
  });

  it('keeps the first day when the server starts', async () => {
    prisma.platformSubscription.findMany.mockResolvedValue([]);

    await service.onApplicationBootstrap();

    expect(prisma.recurringIncomeDay.upsert).toHaveBeenCalledTimes(1);
  });

  it('does not stop the server when a day cannot be kept', async () => {
    prisma.platformSubscription.findMany.mockRejectedValue(new Error('down'));

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(prisma.recurringIncomeDay.upsert).not.toHaveBeenCalled();
  });

  it('reads the days kept newest first, each with its date as a day', async () => {
    prisma.recurringIncomeDay.findMany.mockResolvedValue([
      {
        day: new Date('2026-03-10T00:00:00Z'),
        mrrCents: 3998,
        activeSubscriptions: 2,
      },
      {
        day: new Date('2026-03-09T00:00:00Z'),
        mrrCents: 999,
        activeSubscriptions: 1,
      },
    ]);

    await expect(service.history()).resolves.toEqual({
      days: [
        { day: '2026-03-10', mrrCents: 3998, activeSubscriptions: 2 },
        { day: '2026-03-09', mrrCents: 999, activeSubscriptions: 1 },
      ],
    });
    expect(prisma.recurringIncomeDay.findMany).toHaveBeenCalledWith({
      orderBy: { day: 'desc' },
      take: 30,
      select: { day: true, mrrCents: true, activeSubscriptions: true },
    });
  });

  it.each([
    [7, 7],
    [500, 90],
    [0, 30],
    [-3, 1],
    [Number.NaN, 30],
    [7.9, 7],
  ])('asked for %s days it reads %s', async (asked, read) => {
    prisma.recurringIncomeDay.findMany.mockResolvedValue([]);

    await service.history(asked);

    expect(prisma.recurringIncomeDay.findMany.mock.calls[0][0].take).toBe(read);
  });
});
