-- AlterTable: account deletion grace + temporary suspension
-- User model maps to "users" (@@map("users"))
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "scheduledDeletionAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "suspendedUntil" TIMESTAMP(3);

-- Backfill: if deletedAt was used as a future hard-delete date (legacy scheduleDeletion),
-- move it to scheduledDeletionAt and set deletedAt to now.
UPDATE "users"
SET "scheduledDeletionAt" = "deletedAt",
    "deletedAt" = CURRENT_TIMESTAMP
WHERE "deletedAt" IS NOT NULL
  AND "deletedAt" > CURRENT_TIMESTAMP
  AND "scheduledDeletionAt" IS NULL;

CREATE INDEX IF NOT EXISTS "users_scheduledDeletionAt_idx" ON "users"("scheduledDeletionAt");
CREATE INDEX IF NOT EXISTS "users_suspendedUntil_idx" ON "users"("suspendedUntil");

-- Role: add MODERATOR for scoped trust & safety access
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MODERATOR';

-- Report queue workflow fields
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "assignedToId" TEXT;
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);
ALTER TABLE "reports" ADD COLUMN IF NOT EXISTS "internalNotes" TEXT;

CREATE INDEX IF NOT EXISTS "reports_status_createdAt_idx" ON "reports"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "reports_assignedToId_idx" ON "reports"("assignedToId");
CREATE INDEX IF NOT EXISTS "reports_resolvedAt_idx" ON "reports"("resolvedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reports_assignedToId_fkey'
  ) THEN
    ALTER TABLE "reports"
      ADD CONSTRAINT "reports_assignedToId_fkey"
      FOREIGN KEY ("assignedToId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
