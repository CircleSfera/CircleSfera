-- Drop unused TransactionType.PAYOUT (payouts are Stripe Connect Express only).
-- PostgreSQL cannot DROP a single enum value; recreate the type.

DELETE FROM "transactions" WHERE "type"::text = 'PAYOUT';

CREATE TYPE "TransactionType_new" AS ENUM (
    'DIRECT_POST_UNLOCK',
    'DIRECT_STORY_UNLOCK',
    'DIRECT_TIP',
    'STRIPE_SUBSCRIPTION',
    'PROMOTION_PAYMENT'
);

ALTER TABLE "transactions"
    ALTER COLUMN "type" TYPE "TransactionType_new"
    USING ("type"::text::"TransactionType_new");

DROP TYPE "TransactionType";

ALTER TYPE "TransactionType_new" RENAME TO "TransactionType";
