-- The columns of the former sale of content and of the monetization
-- programme lose their defaults and may be empty: the application no longer
-- names them, so new rows leave them NULL, and the release that drops them
-- can roll back to this one. Nothing is dropped here.
ALTER TABLE "posts" ALTER COLUMN "isPremium" DROP DEFAULT, ALTER COLUMN "isPremium" DROP NOT NULL;
ALTER TABLE "posts" ALTER COLUMN "priceCents" DROP DEFAULT, ALTER COLUMN "priceCents" DROP NOT NULL;
ALTER TABLE "stories" ALTER COLUMN "isPremium" DROP DEFAULT, ALTER COLUMN "isPremium" DROP NOT NULL;
ALTER TABLE "stories" ALTER COLUMN "priceCents" DROP DEFAULT, ALTER COLUMN "priceCents" DROP NOT NULL;
ALTER TABLE "messages" ALTER COLUMN "isLocked" DROP DEFAULT, ALTER COLUMN "isLocked" DROP NOT NULL;
ALTER TABLE "messages" ALTER COLUMN "priceCents" DROP DEFAULT, ALTER COLUMN "priceCents" DROP NOT NULL;
ALTER TABLE "profiles" ALTER COLUMN "monetizationStatus" DROP DEFAULT, ALTER COLUMN "monetizationStatus" DROP NOT NULL;

-- A promotion refund named the person refunded as its receiver, a column
-- the next release drops. The person is now its sender, as on the payment
-- it refunds; refunds recorded before keep their person the same way.
-- Touching updatedAt sends them to the analytics warehouse again.
UPDATE "transactions"
SET "senderId" = "receiverId", "updatedAt" = CURRENT_TIMESTAMP
WHERE "type" = 'PROMOTION_PAYMENT'
  AND "senderId" IS NULL
  AND "receiverId" IS NOT NULL;
