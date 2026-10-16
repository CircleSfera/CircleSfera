-- The painted layer of a video story while it waits to be joined to its
-- video. Empty once joined, and for every other story.

-- AlterTable
ALTER TABLE "stories" ADD COLUMN "overlayUrl" TEXT;
