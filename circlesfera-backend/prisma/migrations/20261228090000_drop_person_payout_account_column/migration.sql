-- The person's own payout account column is no longer read or written: every
-- account lives on a row of earnings. The column goes only when no account
-- would be lost with it. If a person's column still names an account that no
-- row holds, the column and its index stay, nothing changes, and the migration
-- still completes, so the backend starts. A later migration settles those
-- accounts and drops the column then.
DO $$
DECLARE missing integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'users'
      AND column_name = 'stripeConnectAccountId'
  ) THEN
    RETURN;
  END IF;

  EXECUTE $q$
    SELECT count(*) FROM "users" u
    WHERE u."stripeConnectAccountId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "monetization" m
        WHERE m."stripeConnectAccountId" = u."stripeConnectAccountId"
      )
  $q$ INTO missing;

  IF missing > 0 THEN
    RAISE NOTICE 'users.stripeConnectAccountId kept: % account(s) are on no payout row', missing;
    RETURN;
  END IF;

  DROP INDEX IF EXISTS "users_stripeConnectAccountId_key";
  -- safe-contract-phase: no code reads or writes this column since #917.
  ALTER TABLE "users" DROP COLUMN IF EXISTS "stripeConnectAccountId";
END $$;
