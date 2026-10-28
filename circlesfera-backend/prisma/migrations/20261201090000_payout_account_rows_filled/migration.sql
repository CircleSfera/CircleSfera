-- From this release the backend reads each payout account from the rows of
-- earnings instead of the person. Rows an older backend wrote while the
-- previous step was deployed may lack what that step filled; this fills them
-- again, and changes nothing that is already filled.

-- Every person with a payout account has a row to hold it.
INSERT INTO "monetization" ("id", "userId", "updatedAt")
SELECT gen_random_uuid()::text, u."id", CURRENT_TIMESTAMP
FROM "users" u
WHERE u."stripeConnectAccountId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "monetization" m WHERE m."userId" = u."id");

-- The row holds the person's account: the person's column is what every
-- payment used until now, so it wins wherever the two differ.
UPDATE "monetization" m
SET "stripeConnectAccountId" = u."stripeConnectAccountId"
FROM "users" u
WHERE m."userId" = u."id"
  AND u."stripeConnectAccountId" IS NOT NULL
  AND m."stripeConnectAccountId" IS DISTINCT FROM u."stripeConnectAccountId";

-- A row without a Profile goes to the person's oldest Creator or Business
-- Profile, or to their oldest Profile when none earns.
UPDATE "monetization" m
SET "profileId" = (
  SELECT p."id"
  FROM "profiles" p
  WHERE p."userId" = m."userId"
  ORDER BY (p."accountType" = 'PERSONAL'), p."createdAt", p."id"
  LIMIT 1
)
WHERE m."profileId" IS NULL;

-- Each payout recorded without a Profile belongs to the Profile holding its
-- account.
UPDATE "stripe_payout_logs" l
SET "profileId" = m."profileId"
FROM "monetization" m
WHERE l."userId" = m."userId"
  AND l."profileId" IS NULL
  AND m."profileId" IS NOT NULL;
