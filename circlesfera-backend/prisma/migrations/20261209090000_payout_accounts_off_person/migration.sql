-- From this release the backend never reads or writes the person's own
-- column for a payout account: every account is read from the rows of
-- earnings. An account that only that column names is put on the person's
-- row first, so none is lost. Nothing already on a row changes, and running
-- this again changes nothing.

-- A person whose account no row holds, and who has no row, gets one.
INSERT INTO "monetization" ("id", "userId", "updatedAt")
SELECT gen_random_uuid()::text, u."id", CURRENT_TIMESTAMP
FROM "users" u
WHERE u."stripeConnectAccountId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "monetization" m
    WHERE m."stripeConnectAccountId" = u."stripeConnectAccountId"
  )
  AND NOT EXISTS (SELECT 1 FROM "monetization" m WHERE m."userId" = u."id");

-- The person's row takes that account while it holds none.
UPDATE "monetization" m
SET "stripeConnectAccountId" = u."stripeConnectAccountId",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "users" u
WHERE m."userId" = u."id"
  AND m."stripeConnectAccountId" IS NULL
  AND u."stripeConnectAccountId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "monetization" o
    WHERE o."stripeConnectAccountId" = u."stripeConnectAccountId"
  );

-- A person's row holding an account without a Profile goes to their oldest
-- Creator or Business Profile (their oldest Profile when none earns) that
-- holds no row of its own.
UPDATE "monetization" m
SET "profileId" = (
    SELECT p."id"
    FROM "profiles" p
    WHERE p."userId" = m."userId"
      AND NOT EXISTS (SELECT 1 FROM "monetization" o WHERE o."profileId" = p."id")
    ORDER BY (p."accountType" = 'PERSONAL'), p."createdAt", p."id"
    LIMIT 1
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE m."profileId" IS NULL
  AND m."userId" IS NOT NULL
  AND m."stripeConnectAccountId" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "profiles" p
    WHERE p."userId" = m."userId"
      AND NOT EXISTS (SELECT 1 FROM "monetization" o WHERE o."profileId" = p."id")
  );
