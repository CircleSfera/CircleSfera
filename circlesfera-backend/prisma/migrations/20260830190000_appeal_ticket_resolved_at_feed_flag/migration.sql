-- Appeal and support ticket resolution timestamps (Trust MTTR)
ALTER TABLE "appeals" ADD COLUMN "resolvedAt" TIMESTAMP(3);

CREATE INDEX "appeals_resolvedAt_idx" ON "appeals"("resolvedAt");

UPDATE "appeals"
SET "resolvedAt" = "updatedAt"
WHERE "status" IN ('APPROVED', 'REJECTED') AND "resolvedAt" IS NULL;

ALTER TABLE "support_tickets" ADD COLUMN "resolvedAt" TIMESTAMP(3);

CREATE INDEX "support_tickets_resolvedAt_idx" ON "support_tickets"("resolvedAt");

UPDATE "support_tickets"
SET "resolvedAt" = "updatedAt"
WHERE "status" IN ('RESOLVED', 'CLOSED') AND "resolvedAt" IS NULL;

-- Default-off experiment row for Home For You following-first treatment
INSERT INTO "feature_flags" (
  "id",
  "key",
  "name",
  "description",
  "isEnabled",
  "percentage",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  'feed_home_following_first',
  'Home: Following-first For You',
  'Treatment serves the existing following feed on GET /feed/foryou. Control keeps hybrid ranking. Roll out from Admin → Experiments.',
  false,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "feature_flags" WHERE "key" = 'feed_home_following_first'
);
