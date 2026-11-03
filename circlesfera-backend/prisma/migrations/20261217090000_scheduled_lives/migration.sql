-- A host schedules a live ahead of time, and the Profiles that may watch it
-- ask to be reminded. Only adds: two tables, their status, and the notice
-- that a scheduled live starts soon. Each row is erased with its host or
-- with the Profile reminded.

-- CreateEnum
CREATE TYPE "ScheduledLiveStatus" AS ENUM ('SCHEDULED', 'STARTED', 'CANCELLED', 'MISSED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LIVE_STARTING_SOON';

-- CreateTable
CREATE TABLE "scheduled_lives" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "audience" "LiveAudience" NOT NULL DEFAULT 'EVERYONE',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledLiveStatus" NOT NULL DEFAULT 'SCHEDULED',
    "liveStreamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_lives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_live_reminders" (
    "id" TEXT NOT NULL,
    "scheduledLiveId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "soonNotifiedAt" TIMESTAMP(3),

    CONSTRAINT "scheduled_live_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_lives_hostId_status_startsAt_idx" ON "scheduled_lives"("hostId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "scheduled_lives_status_startsAt_idx" ON "scheduled_lives"("status", "startsAt");

-- CreateIndex
CREATE INDEX "scheduled_lives_liveStreamId_idx" ON "scheduled_lives"("liveStreamId");

-- CreateIndex
CREATE INDEX "scheduled_live_reminders_profileId_idx" ON "scheduled_live_reminders"("profileId");

-- CreateIndex
CREATE INDEX "scheduled_live_reminders_scheduledLiveId_soonNotifiedAt_idx" ON "scheduled_live_reminders"("scheduledLiveId", "soonNotifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_live_reminders_scheduledLiveId_profileId_key" ON "scheduled_live_reminders"("scheduledLiveId", "profileId");

-- AddForeignKey
ALTER TABLE "scheduled_lives" ADD CONSTRAINT "scheduled_lives_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_lives" ADD CONSTRAINT "scheduled_lives_liveStreamId_fkey" FOREIGN KEY ("liveStreamId") REFERENCES "live_streams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_live_reminders" ADD CONSTRAINT "scheduled_live_reminders_scheduledLiveId_fkey" FOREIGN KEY ("scheduledLiveId") REFERENCES "scheduled_lives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_live_reminders" ADD CONSTRAINT "scheduled_live_reminders_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

