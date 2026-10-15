-- Stickers of stories (poll, question, quiz, slider, mention, place,
-- hashtag) and what viewers gave them. Adds two tables and copies the polls
-- and questions of existing stories, with their votes and answers, keeping
-- their ids. The old rows of story polls and questions are left as they are.

-- CreateEnum
CREATE TYPE "StoryStickerKind" AS ENUM ('POLL', 'QUESTION', 'QUIZ', 'SLIDER', 'MENTION', 'LOCATION', 'HASHTAG');

-- CreateTable
CREATE TABLE "story_stickers" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "kind" "StoryStickerKind" NOT NULL,
    "settings" JSONB NOT NULL,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "scale" DOUBLE PRECISION,
    "rotation" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_stickers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_sticker_responses" (
    "id" TEXT NOT NULL,
    "stickerId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "voteKey" TEXT,
    "optionIndex" INTEGER,
    "value" DOUBLE PRECISION,
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_sticker_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "story_stickers_storyId_idx" ON "story_stickers"("storyId");

-- CreateIndex
CREATE INDEX "story_sticker_responses_stickerId_idx" ON "story_sticker_responses"("stickerId");

-- CreateIndex
CREATE UNIQUE INDEX "story_sticker_responses_voteKey_profileId_key" ON "story_sticker_responses"("voteKey", "profileId");

-- AddForeignKey
ALTER TABLE "story_stickers" ADD CONSTRAINT "story_stickers_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_sticker_responses" ADD CONSTRAINT "story_sticker_responses_stickerId_fkey" FOREIGN KEY ("stickerId") REFERENCES "story_stickers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_sticker_responses" ADD CONSTRAINT "story_sticker_responses_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Copy the polls of stories, with their place on the story.
INSERT INTO "story_stickers" ("id", "storyId", "kind", "settings", "x", "y", "scale", "rotation", "createdAt")
SELECT p."id", p."storyId", 'POLL', jsonb_build_object('question', p."question", 'options', to_jsonb(p."options")),
       p."stickerX", p."stickerY", p."stickerScale", p."stickerRotation", p."createdAt"
FROM "polls" p
WHERE p."storyId" IS NOT NULL;

-- Copy the questions of stories, with their place on the story.
INSERT INTO "story_stickers" ("id", "storyId", "kind", "settings", "x", "y", "scale", "rotation", "createdAt")
SELECT q."id", q."storyId", 'QUESTION', jsonb_build_object('prompt', q."prompt"),
       q."stickerX", q."stickerY", q."stickerScale", q."stickerRotation", q."createdAt"
FROM "qna_boxes" q
WHERE q."storyId" IS NOT NULL;

-- Their votes: one per person, keyed by the sticker.
INSERT INTO "story_sticker_responses" ("id", "stickerId", "profileId", "voteKey", "optionIndex", "createdAt", "updatedAt")
SELECT v."id", v."pollId", v."profileId", v."pollId", v."optionIndex", v."createdAt", v."createdAt"
FROM "poll_votes" v
JOIN "polls" p ON p."id" = v."pollId"
WHERE p."storyId" IS NOT NULL;

-- Their answers: as many as were given.
INSERT INTO "story_sticker_responses" ("id", "stickerId", "profileId", "text", "createdAt", "updatedAt")
SELECT a."id", a."qnaBoxId", a."profileId", a."answerText", a."createdAt", a."createdAt"
FROM "qna_answers" a
JOIN "qna_boxes" q ON q."id" = a."qnaBoxId"
WHERE q."storyId" IS NOT NULL;
