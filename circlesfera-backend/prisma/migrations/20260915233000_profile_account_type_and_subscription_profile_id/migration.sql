-- DropIndex
DROP INDEX IF EXISTS "platform_subscriptions_userId_planId_key";

-- AlterTable
ALTER TABLE "platform_subscriptions" ADD COLUMN IF NOT EXISTS "profileId" TEXT;

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "accountType" "AccountType" NOT NULL DEFAULT 'PERSONAL',
ADD COLUMN IF NOT EXISTS "verificationLevel" "VerificationLevel" NOT NULL DEFAULT 'BASIC';

-- Data-safe backfill from users to profiles if columns exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'accountType'
  ) THEN
    UPDATE "profiles" p
    SET "accountType" = u."accountType",
        "verificationLevel" = u."verificationLevel"
    FROM "users" u
    WHERE p."userId" = u."id";
  END IF;
END $$;

-- Drop legacy columns from users
ALTER TABLE "users" DROP COLUMN IF EXISTS "accountType",
DROP COLUMN IF EXISTS "verificationLevel";

-- Backfill profileId in platform_subscriptions
DO $$
BEGIN
  UPDATE "platform_subscriptions" ps
  SET "profileId" = p.id
  FROM "profiles" p
  WHERE p."userId" = ps."userId" AND ps."profileId" IS NULL;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "platform_subscriptions_profileId_idx" ON "platform_subscriptions"("profileId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'platform_subscriptions_profileId_fkey'
  ) THEN
    ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
