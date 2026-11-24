-- The different people a promotion reached (PD-089), counted on each
-- person's first view. Views by person are purged after 7 days, so the count
-- is kept on the promotion.
-- AlterTable
ALTER TABLE "promotions" ADD COLUMN "peopleReached" INTEGER NOT NULL DEFAULT 0;

-- The promotions there are: the different people in the views still kept.
UPDATE "promotions" p
SET "peopleReached" = v."people"
FROM (
  SELECT "promotionId", COUNT(DISTINCT "userId")::int AS "people"
  FROM "promotion_views"
  GROUP BY "promotionId"
) v
WHERE v."promotionId" = p."id";
