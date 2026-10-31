-- A post or Frame shared to a story is a sticker naming it; its author may
-- turn sharing off for new stories.
ALTER TYPE "StoryStickerKind" ADD VALUE 'POST';
ALTER TABLE "profiles" ADD COLUMN "allowStoryShares" BOOLEAN NOT NULL DEFAULT true;
