-- Staff can hide a hashtag used for spam or abuse: search stops offering it
-- and its page lists nothing. The posts that use it are not touched.
ALTER TABLE "hashtags" ADD COLUMN "isHidden" BOOLEAN NOT NULL DEFAULT false;
