-- A Profile pins up to three posts and Frames at the top of its profile.
-- Only adds a nullable column.
ALTER TABLE "posts" ADD COLUMN "pinnedToProfileAt" TIMESTAMP(3);
