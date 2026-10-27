-- Each broadcast's recording is kept as parts: the host's camera and
-- microphone, and each co-host's, recorded apart and composed afterwards.
-- Only added; no data changes.

-- CreateEnum
CREATE TYPE "LiveRecordingRole" AS ENUM ('HOST', 'COHOST');

-- CreateEnum
CREATE TYPE "LiveRecordingPartStatus" AS ENUM ('RECORDING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "live_recording_parts" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "role" "LiveRecordingRole" NOT NULL,
    "egressId" TEXT,
    "file" TEXT NOT NULL,
    "status" "LiveRecordingPartStatus" NOT NULL DEFAULT 'RECORDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "sizeBytes" BIGINT,

    CONSTRAINT "live_recording_parts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "live_recording_parts_egressId_key" ON "live_recording_parts"("egressId");

-- CreateIndex
CREATE UNIQUE INDEX "live_recording_parts_file_key" ON "live_recording_parts"("file");

-- CreateIndex
CREATE INDEX "live_recording_parts_streamId_idx" ON "live_recording_parts"("streamId");

-- CreateIndex
CREATE INDEX "live_recording_parts_status_idx" ON "live_recording_parts"("status");

-- AddForeignKey
ALTER TABLE "live_recording_parts" ADD CONSTRAINT "live_recording_parts_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "live_streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

