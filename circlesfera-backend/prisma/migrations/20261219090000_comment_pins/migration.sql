-- The author of a post pins up to three of its comments; they are shown
-- first. Only adds a nullable column.
ALTER TABLE "comments" ADD COLUMN "pinnedAt" TIMESTAMP(3);
