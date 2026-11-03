-- The image a frame's author uploaded and chose as the cover. Empty when the
-- cover is a moment of the video or the one made by the server alone.
ALTER TABLE "post_media" ADD COLUMN "coverImageUrl" TEXT;
