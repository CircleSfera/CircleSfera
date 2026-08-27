-- Additive cents columns (source of truth). Legacy Float columns kept for this release.
ALTER TABLE "platform_plans" ADD COLUMN IF NOT EXISTS "priceCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "platform_plans" ADD COLUMN IF NOT EXISTS "yearlyPriceCents" INTEGER;

ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "budgetCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "dailyBudgetCents" INTEGER;

-- Backfill from major-unit Float values
UPDATE "platform_plans"
SET "priceCents" = ROUND("price" * 100)::INTEGER,
    "yearlyPriceCents" = CASE
      WHEN "yearlyPrice" IS NULL THEN NULL
      ELSE ROUND("yearlyPrice" * 100)::INTEGER
    END;

UPDATE "promotions"
SET "budgetCents" = ROUND("budget" * 100)::INTEGER,
    "dailyBudgetCents" = CASE
      WHEN "dailyBudget" IS NULL THEN NULL
      ELSE ROUND("dailyBudget" * 100)::INTEGER
    END;
