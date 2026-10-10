-- The moment of its video a frame's author chose as the cover, in
-- milliseconds. Empty when the cover is the one made by the server alone.
ALTER TABLE "post_media" ADD COLUMN "coverTimeMs" INTEGER;
