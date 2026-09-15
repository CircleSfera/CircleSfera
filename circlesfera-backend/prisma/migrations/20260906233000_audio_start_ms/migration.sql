-- Additive: clip start offset into first-party audio tracks (ms).
-- Window length is derived from media duration at playback (not stored).
ALTER TABLE "posts" ADD COLUMN "audioStartMs" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "stories" ADD COLUMN "audioStartMs" INTEGER NOT NULL DEFAULT 0;
