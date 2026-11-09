import { ErrorCode } from '@circlesfera/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  SUPPORT_CHECKOUT_LIFETIME_SECONDS,
  withWeeklySupportRoom,
} from './support-limit.js';

const NOW = new Date('2026-11-10T12:00:00.000Z');

// A database whose sums are the ones given, run inside a transaction.
const dbWith = ({
  paid = 0,
  refunded = 0,
  tipsOpen = 0,
  giftsOpen = 0,
}: {
  paid?: number | null;
  refunded?: number | null;
  tipsOpen?: number | null;
  giftsOpen?: number | null;
}) => {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    transaction: {
      aggregate: vi.fn().mockResolvedValue({
        _sum: { amount: paid, refundedCents: refunded },
      }),
    },
    tipReservation: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: tipsOpen } }),
    },
    liveGift: {
      aggregate: vi
        .fn()
        .mockResolvedValue({ _sum: { amountCents: giftsOpen } }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { tx, prisma: prisma as any };
};

describe('withWeeklySupportRoom', () => {
  it('holds the amount when it fits, under a lock of the person, and returns the hold', async () => {
    const { tx, prisma } = dbWith({
      paid: null,
      refunded: null,
      tipsOpen: null,
      giftsOpen: null,
    });
    const hold = vi.fn().mockResolvedValue({ id: 'r-1' });

    await expect(
      withWeeklySupportRoom(prisma, 'fan-1', 5000, hold, NOW),
    ).resolves.toEqual({ id: 'r-1' });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    // Payments are read after the open checkouts, so a payment completing
    // between the reads is never missed.
    expect(
      tx.transaction.aggregate.mock.invocationCallOrder[0],
    ).toBeGreaterThan(tx.tipReservation.aggregate.mock.invocationCallOrder[0]);
    expect(
      tx.transaction.aggregate.mock.invocationCallOrder[0],
    ).toBeGreaterThan(tx.liveGift.aggregate.mock.invocationCallOrder[0]);
    expect(hold).toHaveBeenCalledWith(tx);
    // Payments of the week, by this person, of tips and gifts.
    expect(tx.transaction.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          senderId: 'fan-1',
          type: { in: ['DIRECT_TIP', 'DIRECT_LIVE_GIFT'] },
          status: { in: ['COMPLETED', 'DISPUTED'] },
          createdAt: { gte: new Date('2026-11-03T12:00:00.000Z') },
        }),
      }),
    );
    // Checkouts still open: tips not expired, gifts pending of the last
    // checkout lifetime.
    expect(tx.tipReservation.aggregate).toHaveBeenCalledWith({
      where: { senderId: 'fan-1', expiresAt: { gt: NOW } },
      _sum: { amountCents: true },
    });
    expect(tx.liveGift.aggregate).toHaveBeenCalledWith({
      where: {
        senderId: 'fan-1',
        status: 'PENDING',
        createdAt: {
          gt: new Date(
            NOW.getTime() - SUPPORT_CHECKOUT_LIFETIME_SECONDS * 1000,
          ),
        },
      },
      _sum: { amountCents: true },
    });
  });

  it('lets a tip reach the limit exactly', async () => {
    const { prisma } = dbWith({ paid: 45000 });
    const hold = vi.fn().mockResolvedValue('held');
    await expect(
      withWeeklySupportRoom(prisma, 'fan-1', 5000, hold, NOW),
    ).resolves.toBe('held');
  });

  it('counts open checkouts, takes refunds off, and refuses past the limit, saying what is left', async () => {
    // 400 € paid, 20 € of it refunded, 50 € in a tip and 10 € in a gift
    // still open: 440 € given, 60 € left.
    const { prisma } = dbWith({
      paid: 40000,
      refunded: 2000,
      tipsOpen: 5000,
      giftsOpen: 1000,
    });
    const hold = vi.fn();

    await expect(
      withWeeklySupportRoom(prisma, 'fan-1', 10000, hold, NOW),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.WEEKLY_SUPPORT_LIMIT_REACHED,
      response: expect.objectContaining({
        details: { limitCents: 50000, remainingCents: 6000 },
      }),
    });
    expect(hold).not.toHaveBeenCalled();
  });

  it('says nothing is left once the limit is passed', async () => {
    const { prisma } = dbWith({ paid: 52000 });
    await expect(
      withWeeklySupportRoom(prisma, 'fan-1', 200, vi.fn(), NOW),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        details: { limitCents: 50000, remainingCents: 0 },
      }),
    });
  });

  it('reads the clock when no moment is given', async () => {
    const { prisma } = dbWith({});
    await expect(
      withWeeklySupportRoom(prisma, 'fan-1', 200, async () => 'ok'),
    ).resolves.toBe('ok');
  });
});
