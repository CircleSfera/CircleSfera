-- Every broadcast may be recorded by the environment's own recorder: where
-- the recording is, the recorder's job, the file it wrote, and whether the
-- host put it on their Profile. Only added; no data changes.

-- CreateEnum
CREATE TYPE "LiveRecordingStatus" AS ENUM ('NONE', 'RECORDING', 'PROCESSING', 'READY', 'FAILED', 'SKIPPED_LIMIT');

-- AlterTable
ALTER TABLE "live_streams" ADD COLUMN     "egressId" TEXT,
ADD COLUMN     "endedByStaff" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "recordingDurationMs" INTEGER,
ADD COLUMN     "recordingFile" TEXT,
ADD COLUMN     "recordingSizeBytes" BIGINT,
ADD COLUMN     "recordingStartedAt" TIMESTAMP(3),
ADD COLUMN     "recordingStatus" "LiveRecordingStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "thumbnailUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "live_streams_egressId_key" ON "live_streams"("egressId");

-- CreateIndex
CREATE INDEX "live_streams_recordingStatus_idx" ON "live_streams"("recordingStatus");

-- CreateIndex
CREATE INDEX "live_streams_hostId_publishedAt_idx" ON "live_streams"("hostId", "publishedAt");
