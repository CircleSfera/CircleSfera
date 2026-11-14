-- A Profile may hold one add-on (Edits Studio Pro) beside its plan. Every
-- subscription recorded so far is a plan, so all start as not an add-on.
ALTER TABLE "platform_subscriptions" ADD COLUMN "addOn" BOOLEAN NOT NULL DEFAULT false;

-- At most one active plan and one active add-on per Profile: two checkouts
-- at once still cannot leave a Profile with two of either.
DROP INDEX IF EXISTS "platform_subscriptions_one_active_per_profile";
CREATE UNIQUE INDEX "platform_subscriptions_one_active_per_profile"
ON "platform_subscriptions" ("profileId", "addOn")
WHERE "status" IN ('ACTIVE', 'TRIALING') AND "profileId" IS NOT NULL;
