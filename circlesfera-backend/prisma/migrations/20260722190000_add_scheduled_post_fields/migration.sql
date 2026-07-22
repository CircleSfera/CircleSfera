-- Sync scheduling fields already present in schema.prisma but missing from DB.
DO $$ BEGIN
  CREATE TYPE "ScheduledPostStatus" AS ENUM ('SCHEDULED', 'PUBLISHED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "posts"
  ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "scheduledStatus" "ScheduledPostStatus" NOT NULL DEFAULT 'PUBLISHED';

ALTER TABLE "stories"
  ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "scheduledStatus" "ScheduledPostStatus" NOT NULL DEFAULT 'PUBLISHED';
