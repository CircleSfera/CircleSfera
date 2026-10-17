-- A promotion is aimed by country only, and always refunds what it did not
-- spend: objective, interests and the no-refund policy go, with their data.
ALTER TABLE "promotions" DROP COLUMN "objective";
ALTER TABLE "promotions" DROP COLUMN "interests";
ALTER TABLE "promotions" DROP COLUMN "refundPolicy";
DROP TYPE "PromotionRefundPolicy";

-- Countries were free text matched against the viewer's location. Only a
-- list of ISO codes is kept; anything else reaches everywhere.
UPDATE "promotions" SET "countries" = upper(replace("countries", ' ', ''))
WHERE "countries" IS NOT NULL;
UPDATE "promotions" SET "countries" = NULL
WHERE "countries" IS NOT NULL
  AND "countries" !~ '^[A-Z]{2}(,[A-Z]{2})*$';

-- The country a person says they are in, for the promotions they see.
ALTER TABLE "user_settings" ADD COLUMN "country" TEXT;
