-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'DIRECT_STORY_UNLOCK';

-- AlterTable monetization cache
ALTER TABLE "monetization" ADD COLUMN IF NOT EXISTS "transfersEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "monetization" ADD COLUMN IF NOT EXISTS "chargesEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable transactions
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "stripePaymentIntentId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_stripePaymentIntentId_key" ON "transactions"("stripePaymentIntentId");
ALTER TABLE "transactions" ALTER COLUMN "currency" SET DEFAULT 'EUR';

-- CreateTable
CREATE TABLE IF NOT EXISTS "story_unlocks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "pricePaid" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "story_unlocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "story_unlocks_userId_storyId_key" ON "story_unlocks"("userId", "storyId");

DO $$ BEGIN
  ALTER TABLE "story_unlocks" ADD CONSTRAINT "story_unlocks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "story_unlocks" ADD CONSTRAINT "story_unlocks_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
