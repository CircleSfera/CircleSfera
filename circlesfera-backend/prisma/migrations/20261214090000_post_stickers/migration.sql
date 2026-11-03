-- A sticker sits on a story or on one photo of a post, never both. Every
-- sticker until now is on a story and keeps it; nothing is rewritten.
ALTER TABLE "story_stickers" ALTER COLUMN "storyId" DROP NOT NULL;

ALTER TABLE "story_stickers" ADD COLUMN "postMediaId" TEXT;

-- Exactly one of the two is set.
ALTER TABLE "story_stickers" ADD CONSTRAINT "story_stickers_one_owner_check" CHECK (num_nonnulls("storyId", "postMediaId") = 1);

-- CreateIndex
CREATE INDEX "story_stickers_postMediaId_idx" ON "story_stickers"("postMediaId");

-- AddForeignKey
ALTER TABLE "story_stickers" ADD CONSTRAINT "story_stickers_postMediaId_fkey" FOREIGN KEY ("postMediaId") REFERENCES "post_media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
