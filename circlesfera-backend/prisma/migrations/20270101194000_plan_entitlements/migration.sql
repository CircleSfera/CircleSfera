-- What a plan gives and to whom becomes data the plan catalog sets, instead
-- of words read from its name: the badge level, the type of Profile it is
-- for, and whether it is an add-on.
-- AlterTable
ALTER TABLE "platform_plans" ADD COLUMN "badge" "VerificationLevel" NOT NULL DEFAULT 'BASIC',
ADD COLUMN "forAccountType" "AccountType",
ADD COLUMN "addOn" BOOLEAN NOT NULL DEFAULT false;

-- The plans there are, as their names said until now; the catalog sync sets
-- them from then on.
UPDATE "platform_plans" SET "badge" = 'BUSINESS', "forAccountType" = 'BUSINESS'
WHERE lower("name") LIKE '%business%';
UPDATE "platform_plans" SET "badge" = 'ELITE', "forAccountType" = 'CREATOR'
WHERE lower("name") LIKE '%elite%' AND lower("name") NOT LIKE '%business%';
UPDATE "platform_plans" SET "badge" = 'VERIFIED'
WHERE (lower("name") LIKE '%verified%' OR lower("name") LIKE '%premium%')
  AND lower("name") NOT LIKE '%business%'
  AND lower("name") NOT LIKE '%elite%';
UPDATE "platform_plans" SET "addOn" = true WHERE "name" = 'Edits Studio Pro';
