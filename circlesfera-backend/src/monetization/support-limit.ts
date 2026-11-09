import {
  ErrorCode,
  WEEKLY_SUPPORT_LIMIT_CENTS,
  WEEKLY_SUPPORT_WINDOW_DAYS,
} from '@circlesfera/shared';
import type { Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Refuses a tip or a live gift that would take what one person gave in the
 * last WEEKLY_SUPPORT_WINDOW_DAYS over WEEKLY_SUPPORT_LIMIT_CENTS, tips and
 * gifts together. Payments still being made or under dispute count; what
 * was refunded does not. The answer says how much is left to give.
 */
export async function assertWeeklySupportRoom(
  db: Pick<Prisma.TransactionClient, 'transaction'>,
  senderUserId: string,
  amountCents: number,
  now: Date = new Date(),
): Promise<void> {
  const given = await db.transaction.aggregate({
    where: {
      senderId: senderUserId,
      type: { in: ['DIRECT_TIP', 'DIRECT_LIVE_GIFT'] },
      status: { in: ['PENDING', 'COMPLETED', 'DISPUTED'] },
      createdAt: {
        gte: new Date(now.getTime() - WEEKLY_SUPPORT_WINDOW_DAYS * DAY_MS),
      },
    },
    _sum: { amount: true, refundedCents: true },
  });
  const spent = (given._sum.amount ?? 0) - (given._sum.refundedCents ?? 0);
  if (spent + amountCents > WEEKLY_SUPPORT_LIMIT_CENTS) {
    throw AppException.BadRequest(
      ErrorCode.WEEKLY_SUPPORT_LIMIT_REACHED,
      'This tip or gift would go over the weekly limit.',
      {
        limitCents: WEEKLY_SUPPORT_LIMIT_CENTS,
        remainingCents: Math.max(0, WEEKLY_SUPPORT_LIMIT_CENTS - spent),
      },
    );
  }
}
