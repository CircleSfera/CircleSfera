-- Drop legacy major-unit Float columns; *Cents columns are the source of truth.
-- Backfill already applied in 20260827154718_platform_plan_promotion_money_cents.

ALTER TABLE "platform_plans" DROP COLUMN IF EXISTS "price";
ALTER TABLE "platform_plans" DROP COLUMN IF EXISTS "yearlyPrice";

ALTER TABLE "promotions" DROP COLUMN IF EXISTS "budget";
ALTER TABLE "promotions" DROP COLUMN IF EXISTS "dailyBudget";
