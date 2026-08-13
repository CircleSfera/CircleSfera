-- Report assignee: User → AdminIdentity (Admin Panel operators)

ALTER TABLE "reports" ADD COLUMN "assignedAdminId" TEXT;

-- Backfill: assignee already an AdminIdentity id
UPDATE "reports" r
SET "assignedAdminId" = ai.id
FROM "admin_identities" ai
WHERE r."assignedToId" IS NOT NULL
  AND r."assignedAdminId" IS NULL
  AND ai.id = r."assignedToId";

-- Backfill: legacy staff User id via linkedUserId
UPDATE "reports" r
SET "assignedAdminId" = ai.id
FROM "admin_identities" ai
WHERE r."assignedToId" IS NOT NULL
  AND r."assignedAdminId" IS NULL
  AND ai."linkedUserId" = r."assignedToId";

ALTER TABLE "reports" DROP CONSTRAINT IF EXISTS "reports_assignedToId_fkey";
DROP INDEX IF EXISTS "reports_assignedToId_idx";
ALTER TABLE "reports" DROP COLUMN IF EXISTS "assignedToId";

CREATE INDEX "reports_assignedAdminId_idx" ON "reports"("assignedAdminId");

ALTER TABLE "reports"
  ADD CONSTRAINT "reports_assignedAdminId_fkey"
  FOREIGN KEY ("assignedAdminId") REFERENCES "admin_identities"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
