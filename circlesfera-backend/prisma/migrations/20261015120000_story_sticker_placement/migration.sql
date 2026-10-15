-- The place a creator gives a poll or a question on a story, so viewers can
-- answer it where it was put. Nullable: stories published before keep the
-- placement across the bottom.
ALTER TABLE "polls"
  ADD COLUMN "stickerX" DOUBLE PRECISION,
  ADD COLUMN "stickerY" DOUBLE PRECISION,
  ADD COLUMN "stickerScale" DOUBLE PRECISION,
  ADD COLUMN "stickerRotation" DOUBLE PRECISION;

ALTER TABLE "qna_boxes"
  ADD COLUMN "stickerX" DOUBLE PRECISION,
  ADD COLUMN "stickerY" DOUBLE PRECISION,
  ADD COLUMN "stickerScale" DOUBLE PRECISION,
  ADD COLUMN "stickerRotation" DOUBLE PRECISION;
