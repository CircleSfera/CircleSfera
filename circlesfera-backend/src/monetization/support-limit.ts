import {
  ErrorCode,
  WEEKLY_SUPPORT_LIMIT_CENTS,
  WEEKLY_SUPPORT_WINDOW_DAYS,
} from '@circlesfera/shared';
import type { Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long the checkout of a tip or a live gift stays open, in seconds:
 * while it is open its amount is held against the payer's weekly limit.
 * Stripe's shortest is 30 minutes after it creates the session; the extra
 * minute covers the request and any difference between the two clocks.
 */
export const SUPPORT_CHECKOUT_LIFETIME_SECONDS = 31 * 60;

type SupportDb = Pick<
  Prisma.TransactionClient,
  '$executeRaw' | 'transaction' | 'tipReservation' | 'liveGift'
>;

/**
 * What a person gave in the last WEEKLY_SUPPORT_WINDOW_DAYS, tips and live
 * gifts together: payments made (less what was refunded) and checkouts
 * still open, which may yet be paid.
 */
async function givenThisWeek(
  db: SupportDb,
  senderUserId: string,
  now: Date,
): Promise<number> {
  // Open checkouts first, payments last: a payment that completes between
  // the reads (its hold dropped, its row written) is then counted twice,
  // which only makes the check stricter, and never not at all.
  const tipsOpen = await db.tipReservation.aggregate({
    where: { senderId: senderUserId, expiresAt: { gt: now } },
    _sum: { amountCents: true },
  });
  const giftsOpen = await db.liveGift.aggregate({
    where: {
      senderId: senderUserId,
      status: 'PENDING',
      createdAt: {
        gt: new Date(now.getTime() - SUPPORT_CHECKOUT_LIFETIME_SECONDS * 1000),
      },
    },
    _sum: { amountCents: true },
  });
  const paid = await db.transaction.aggregate({
    where: {
      senderId: senderUserId,
      type: { in: ['DIRECT_TIP', 'DIRECT_LIVE_GIFT'] },
      status: { in: ['COMPLETED', 'DISPUTED'] },
      createdAt: {
        gte: new Date(now.getTime() - WEEKLY_SUPPORT_WINDOW_DAYS * DAY_MS),
      },
    },
    _sum: { amount: true, refundedCents: true },
  });
  return (
    (paid._sum.amount ?? 0) -
    (paid._sum.refundedCents ?? 0) +
    (tipsOpen._sum.amountCents ?? 0) +
    (giftsOpen._sum.amountCents ?? 0)
  );
}

/**
 * Runs `hold` (which writes what holds the amount: a tip reservation or a
 * pending live gift) only if a tip or gift of `amountCents` keeps what the
 * person gave this week within WEEKLY_SUPPORT_LIMIT_CENTS; otherwise
 * refuses, saying how much is left. The check and the hold run under a lock
 * of that person, so two requests at once cannot both pass.
 */
export async function withWeeklySupportRoom<T>(
  prisma: { $transaction<R>(fn: (tx: SupportDb) => Promise<R>): Promise<R> },
  senderUserId: string,
  amountCents: number,
  hold: (tx: SupportDb) => Promise<T>,
  now: Date = new Date(),
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`weekly-support:${senderUserId}`}))`;
    const given = await givenThisWeek(tx, senderUserId, now);
    if (given + amountCents > WEEKLY_SUPPORT_LIMIT_CENTS) {
      throw AppException.BadRequest(
        ErrorCode.WEEKLY_SUPPORT_LIMIT_REACHED,
        'This tip or gift would go over the weekly limit.',
        {
          limitCents: WEEKLY_SUPPORT_LIMIT_CENTS,
          remainingCents: Math.max(0, WEEKLY_SUPPORT_LIMIT_CENTS - given),
        },
      );
    }
    return hold(tx);
  });
}
