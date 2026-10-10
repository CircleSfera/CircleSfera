-- A Platform Plan belongs to one Profile. A person may hold several plans,
-- one per Profile, and a Profile holds at most one active plan.

-- A subscription recorded without a Profile is given the oldest Profile of
-- its person. None is expected: no plan has been bought yet. The count is
-- reported either way.
DO $$
DECLARE
  assigned INTEGER;
BEGIN
  UPDATE "platform_subscriptions" s
  SET "profileId" = (
    SELECT p."id" FROM "profiles" p
    WHERE p."userId" = s."userId"
    ORDER BY p."createdAt", p."id"
    LIMIT 1
  )
  WHERE s."profileId" IS NULL AND s."userId" IS NOT NULL;
  GET DIAGNOSTICS assigned = ROW_COUNT;
  RAISE NOTICE 'Subscriptions given a Profile: %', assigned;
END $$;

-- Two checkouts at once cannot leave a Profile with two active plans.
CREATE UNIQUE INDEX IF NOT EXISTS "platform_subscriptions_one_active_per_profile"
ON "platform_subscriptions" ("profileId")
WHERE "status" IN ('ACTIVE', 'TRIALING') AND "profileId" IS NOT NULL;
