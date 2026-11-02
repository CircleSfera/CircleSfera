import { Prisma } from '@prisma/client';

// The kinds of payment that are a creator's income.
export const INCOME_TYPES = [
  'DIRECT_POST_UNLOCK',
  'DIRECT_STORY_UNLOCK',
  'DIRECT_MESSAGE_UNLOCK',
  'DIRECT_TIP',
  'DIRECT_LIVE_GIFT',
] as const;

// In SQL over the transactions as t: the completed payments of an income
// kind the person received.
export const INCOME_ROWS_SQL = (userId: string) => Prisma.sql`
  t."receiverId" = ${userId}
  AND t.status = 'COMPLETED'
  AND t.type::text IN (${Prisma.join([...INCOME_TYPES])})`;
// And the creator's share of one payment, as creatorEarnings works it out:
// the price without VAT, less the same part of it as was refunded, rounded
// down; then less the platform's fee (PLATFORM_FEE_DECIMAL) rounded down,
// per payment.
const KEPT_SQL = Prisma.sql`
  FLOOR(((t.amount - t."vatCents")::numeric * (t.amount - t."refundedCents"))
    / NULLIF(t.amount, 0))`;
export const SHARE_SQL = Prisma.sql`
  COALESCE((${KEPT_SQL}) - FLOOR((${KEPT_SQL}) * 0.2), 0)`;

/**
 * What each Profile of the person has earned: their share of every completed
 * payment of an income kind they received, by the Profile that received it.
 * A payment that names no Profile (recorded before income named its Profile,
 * or to a Profile since erased) is grouped under an empty Profile.
 */
export function earningsByProfile(
  db: Pick<Prisma.TransactionClient, '$queryRaw'>,
  userId: string,
) {
  return db.$queryRaw<{ receiverProfileId: string | null; earned: bigint }[]>`
    SELECT t."receiverProfileId" AS "receiverProfileId",
      COALESCE(SUM(${SHARE_SQL}), 0)::bigint AS earned
    FROM transactions t
    WHERE ${INCOME_ROWS_SQL(userId)}
    GROUP BY t."receiverProfileId"`;
}
