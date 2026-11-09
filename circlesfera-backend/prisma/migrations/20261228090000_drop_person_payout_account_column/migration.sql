-- The person's own payout account column goes. Every payout account lives on
-- the payout rows (monetization), one per person or Profile, and no query of
-- the release before this one names the column.
--
-- Irreversible: the values of the column are kept only in the backups.
-- Before dropping, refuse if any account the column names is on no payout
-- row, so an account can never be lost here.
DO $$
DECLARE
  missing integer;
BEGIN
  SELECT count(*) INTO missing
  FROM "users" u
  WHERE u."stripeConnectAccountId" IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "monetization" m
      WHERE m."stripeConnectAccountId" = u."stripeConnectAccountId"
    );
  IF missing > 0 THEN
    RAISE EXCEPTION 'users.stripeConnectAccountId: % account(s) are on no payout row; nothing dropped', missing;
  END IF;
END $$;

-- DropIndex
DROP INDEX IF EXISTS "users_stripeConnectAccountId_key";

-- AlterTable
ALTER TABLE "users" DROP COLUMN IF EXISTS "stripeConnectAccountId";
