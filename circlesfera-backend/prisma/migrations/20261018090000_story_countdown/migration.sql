-- Countdown stickers: when each one ends, and when the people who asked to
-- be reminded were told. Both empty for every other sticker.

-- AlterEnum
ALTER TYPE "StoryStickerKind" ADD VALUE 'COUNTDOWN';

-- AlterTable
ALTER TABLE "story_stickers" ADD COLUMN "announcedAt" TIMESTAMP(3),
ADD COLUMN "endsAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "story_stickers_endsAt_announcedAt_idx" ON "story_stickers"("endsAt", "announcedAt");
