-- When automatic moderation checked a post or story and found nothing: only
-- then is it sold or tipped. Nullable columns, so no table is rewritten;
-- every existing row is unchecked until moderation checks it.
ALTER TABLE "posts" ADD COLUMN "moderationPassedAt" TIMESTAMP(3);
ALTER TABLE "stories" ADD COLUMN "moderationPassedAt" TIMESTAMP(3);

-- What is shown today with no report waiting was checked when it was
-- published: anything automatic moderation found is flagged or hidden. It
-- stays on sale. Anything with a report waiting is checked again by a person.
UPDATE "posts" p SET "moderationPassedAt" = p."createdAt"
WHERE p."moderationStatus" = 'VISIBLE'
  AND NOT EXISTS (
    SELECT 1 FROM "reports" r
    WHERE r."targetType" = 'POST' AND r."targetId" = p."id"
      AND r."status" IN ('PENDING', 'REVIEWING')
  );
UPDATE "stories" s SET "moderationPassedAt" = s."createdAt"
WHERE s."moderationStatus" = 'VISIBLE'
  AND NOT EXISTS (
    SELECT 1 FROM "reports" r
    WHERE r."targetType" = 'STORY' AND r."targetId" = s."id"
      AND r."status" IN ('PENDING', 'REVIEWING')
  );
