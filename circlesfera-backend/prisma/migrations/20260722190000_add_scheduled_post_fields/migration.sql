-- Sync scheduling fields already present in schema.prisma but missing from DB.
CREATE TYPE "ScheduledPostStatus" AS ENUM ('SCHEDULED', 'PUBLISHED', 'CANCELLED');

ALTER TABLE "posts"
  ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "scheduledStatus" "ScheduledPostStatus" NOT NULL DEFAULT 'PUBLISHED';

ALTER TABLE "stories"
  ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "scheduledStatus" "ScheduledPostStatus" NOT NULL DEFAULT 'PUBLISHED';
