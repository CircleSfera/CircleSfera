-- The tables and columns of the former creator payments (sale of posts,
-- stories and messages, tips, live gifts, payouts and the monetization
-- programme) are dropped. The previous release names none of them: it left
-- the columns to their database defaults and emptied the tables, so a deploy
-- that rolls back to it still works, whichever of the steps below ran. The
-- check of former payment kinds runs first, so stopping there changes
-- nothing however the script is executed.

-- Stop, changing nothing, if a payment of a former kind is still recorded:
-- the kinds below are removed from the transaction types.
DO $$
DECLARE
  former_kind INTEGER;
BEGIN
  SELECT count(*) INTO former_kind FROM "transactions"
  WHERE "type"::text IN (
    'DIRECT_POST_UNLOCK',
    'DIRECT_STORY_UNLOCK',
    'DIRECT_MESSAGE_UNLOCK',
    'DIRECT_TIP',
    'DIRECT_LIVE_GIFT'
  );

  IF former_kind > 0 THEN
    RAISE EXCEPTION
      'Payments of a former kind still recorded: %. Nothing was changed.',
      former_kind;
  END IF;
END $$;

-- A promotion refund names the person refunded as its sender. Refunds
-- written by an older image during a rollback window still named them only
-- as the receiver, a column dropped below; they get their sender first.
-- Touching updatedAt sends them to the analytics warehouse again.
UPDATE "transactions"
SET "senderId" = "receiverId", "updatedAt" = CURRENT_TIMESTAMP
WHERE "type" = 'PROMOTION_PAYMENT'
  AND "senderId" IS NULL
  AND "receiverId" IS NOT NULL;

-- The tables of the former creator payments, emptied by the previous release.
ALTER TABLE "live_gifts" DROP CONSTRAINT "live_gifts_receiverId_fkey";
ALTER TABLE "live_gifts" DROP CONSTRAINT "live_gifts_senderId_fkey";
ALTER TABLE "live_gifts" DROP CONSTRAINT "live_gifts_streamId_fkey";
ALTER TABLE "live_gifts" DROP CONSTRAINT "live_gifts_transactionId_fkey";
ALTER TABLE "message_unlocks" DROP CONSTRAINT "message_unlocks_messageId_fkey";
ALTER TABLE "message_unlocks" DROP CONSTRAINT "message_unlocks_userId_fkey";
ALTER TABLE "monetization" DROP CONSTRAINT "monetization_profileId_fkey";
ALTER TABLE "monetization" DROP CONSTRAINT "monetization_userId_fkey";
ALTER TABLE "post_unlocks" DROP CONSTRAINT "post_unlocks_postId_fkey";
ALTER TABLE "post_unlocks" DROP CONSTRAINT "post_unlocks_userId_fkey";
ALTER TABLE "story_unlocks" DROP CONSTRAINT "story_unlocks_storyId_fkey";
ALTER TABLE "story_unlocks" DROP CONSTRAINT "story_unlocks_userId_fkey";
ALTER TABLE "stripe_payout_logs" DROP CONSTRAINT "stripe_payout_logs_profileId_fkey";
ALTER TABLE "stripe_payout_logs" DROP CONSTRAINT "stripe_payout_logs_userId_fkey";

-- @migration-safe: contract phase; the previous release emptied it and names it nowhere
DROP TABLE "live_gifts";
-- @migration-safe: contract phase; the previous release emptied it and names it nowhere
DROP TABLE "tip_reservations";
-- @migration-safe: contract phase; the previous release emptied it and names it nowhere
DROP TABLE "post_unlocks";
-- @migration-safe: contract phase; the previous release emptied it and names it nowhere
DROP TABLE "story_unlocks";
-- @migration-safe: contract phase; the previous release emptied it and names it nowhere
DROP TABLE "message_unlocks";
-- @migration-safe: contract phase; the previous release emptied it and names it nowhere
DROP TABLE "stripe_payout_logs";
-- @migration-safe: contract phase; the previous release emptied it and names it nowhere
DROP TABLE "monetization";

-- The columns of the former sale of content, of the monetization programme,
-- of the hold of payouts and of what a payment was for or who received it.
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_liveStreamId_fkey";
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_messageId_fkey";
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_receiverId_fkey";
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_receiverProfileId_fkey";
DROP INDEX "transactions_liveStreamId_idx";
DROP INDEX "transactions_receiverId_idx";
DROP INDEX "transactions_receiverProfileId_idx";

-- @migration-safe: contract phase; the previous release leaves it to its default
ALTER TABLE "posts" DROP COLUMN "isPremium";
-- @migration-safe: contract phase; the previous release leaves it to its default
ALTER TABLE "posts" DROP COLUMN "priceCents";
-- @migration-safe: contract phase; the previous release leaves it to its default
ALTER TABLE "stories" DROP COLUMN "isPremium";
-- @migration-safe: contract phase; the previous release leaves it to its default
ALTER TABLE "stories" DROP COLUMN "priceCents";
-- @migration-safe: contract phase; the previous release leaves it to its default
ALTER TABLE "messages" DROP COLUMN "isLocked";
-- @migration-safe: contract phase; the previous release leaves it to its default
ALTER TABLE "messages" DROP COLUMN "priceCents";
-- @migration-safe: contract phase; the previous release leaves it to its default
ALTER TABLE "profiles" DROP COLUMN "monetizationStatus";
-- @migration-safe: contract phase; the previous release names it nowhere
ALTER TABLE "profiles" DROP COLUMN "monetizationAppliedAt";
-- @migration-safe: contract phase; the previous release names it nowhere
ALTER TABLE "profiles" DROP COLUMN "monetizationPitch";
-- @migration-safe: contract phase; the previous release names it nowhere
ALTER TABLE "profiles" DROP COLUMN "monetizationReviewedAt";
-- @migration-safe: contract phase; the previous release names it nowhere
ALTER TABLE "profiles" DROP COLUMN "monetizationReviewedBy";
-- @migration-safe: contract phase; the previous release names it nowhere
ALTER TABLE "profiles" DROP COLUMN "monetizationNote";
-- @migration-safe: contract phase; the previous release names it nowhere
ALTER TABLE "users" DROP COLUMN "payoutsHeldAt";
-- @migration-safe: contract phase; the previous release names it nowhere
ALTER TABLE "transactions" DROP COLUMN "receiverId";
-- @migration-safe: contract phase; the previous release names it nowhere
ALTER TABLE "transactions" DROP COLUMN "receiverProfileId";
-- @migration-safe: contract phase; the previous release names it nowhere
ALTER TABLE "transactions" DROP COLUMN "postId";
-- @migration-safe: contract phase; the previous release names it nowhere
ALTER TABLE "transactions" DROP COLUMN "storyId";
-- @migration-safe: contract phase; the previous release names it nowhere
ALTER TABLE "transactions" DROP COLUMN "messageId";
-- @migration-safe: contract phase; the previous release names it nowhere
ALTER TABLE "transactions" DROP COLUMN "liveStreamId";

DROP TYPE "MonetizationStatus";

-- The former kinds leave the transaction types. A value cannot be removed
-- from an enum in place: the type is made again without them.
CREATE TYPE "TransactionType_new" AS ENUM ('STRIPE_SUBSCRIPTION', 'PROMOTION_PAYMENT');
ALTER TABLE "transactions"
  ALTER COLUMN "type" TYPE "TransactionType_new"
  USING ("type"::text::"TransactionType_new");
ALTER TYPE "TransactionType" RENAME TO "TransactionType_old";
ALTER TYPE "TransactionType_new" RENAME TO "TransactionType";
DROP TYPE "TransactionType_old";
