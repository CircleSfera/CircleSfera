-- The polls and questions of stories live in story_stickers since the story
-- editor redesign, which copied them with their votes and answers. This
-- copies anything still missing there, keeping its id, so nothing is lost,
-- then deletes the story rows of the old tables (their votes and answers go
-- with them) and drops the columns only stories used. Posts keep their polls
-- and questions in the old tables.

-- The story polls and questions with no copy yet. Every write since the
-- copy went to story_stickers, so this is expected to be empty; only these
-- bring their votes and answers, so nothing removed from a copy comes back.
CREATE TEMP TABLE "uncopied" AS
SELECT p."id" FROM "polls" p
WHERE p."storyId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "story_stickers" s WHERE s."id" = p."id")
UNION
SELECT q."id" FROM "qna_boxes" q
WHERE q."storyId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "story_stickers" s WHERE s."id" = q."id");

INSERT INTO "story_stickers" ("id", "storyId", "kind", "settings", "x", "y", "scale", "rotation", "createdAt")
SELECT p."id", p."storyId", 'POLL', jsonb_build_object('question', p."question", 'options', to_jsonb(p."options")),
       p."stickerX", p."stickerY", p."stickerScale", p."stickerRotation", p."createdAt"
FROM "polls" p
WHERE p."id" IN (SELECT "id" FROM "uncopied");

INSERT INTO "story_stickers" ("id", "storyId", "kind", "settings", "x", "y", "scale", "rotation", "createdAt")
SELECT q."id", q."storyId", 'QUESTION', jsonb_build_object('prompt', q."prompt"),
       q."stickerX", q."stickerY", q."stickerScale", q."stickerRotation", q."createdAt"
FROM "qna_boxes" q
WHERE q."id" IN (SELECT "id" FROM "uncopied");

INSERT INTO "story_sticker_responses" ("id", "stickerId", "profileId", "voteKey", "optionIndex", "createdAt", "updatedAt")
SELECT v."id", v."pollId", v."profileId", v."pollId", v."optionIndex", v."createdAt", v."createdAt"
FROM "poll_votes" v
WHERE v."pollId" IN (SELECT "id" FROM "uncopied");

INSERT INTO "story_sticker_responses" ("id", "stickerId", "profileId", "text", "createdAt", "updatedAt")
SELECT a."id", a."qnaBoxId", a."profileId", a."answerText", a."createdAt", a."createdAt"
FROM "qna_answers" a
WHERE a."qnaBoxId" IN (SELECT "id" FROM "uncopied");

-- Every story poll and question is now in story_stickers; refuse to go on
-- otherwise, so no row is deleted without its copy.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "polls" p
    WHERE p."storyId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "story_stickers" s WHERE s."id" = p."id")
  ) OR EXISTS (
    SELECT 1 FROM "qna_boxes" q
    WHERE q."storyId" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "story_stickers" s WHERE s."id" = q."id")
  ) THEN
    RAISE EXCEPTION 'a story poll or question has no copy in story_stickers';
  END IF;
END $$;

DROP TABLE "uncopied";

-- The story rows of the old tables, with their votes and answers.
DELETE FROM "polls" WHERE "storyId" IS NOT NULL;
DELETE FROM "qna_boxes" WHERE "storyId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "polls" DROP CONSTRAINT "polls_storyId_fkey";

-- DropForeignKey
ALTER TABLE "qna_boxes" DROP CONSTRAINT "qna_boxes_storyId_fkey";

-- DropIndex
DROP INDEX "polls_storyId_key";

-- DropIndex
DROP INDEX "qna_boxes_storyId_key";

-- AlterTable
ALTER TABLE "polls" DROP COLUMN "stickerRotation",
DROP COLUMN "stickerScale",
DROP COLUMN "stickerX",
DROP COLUMN "stickerY",
DROP COLUMN "storyId";

-- AlterTable
ALTER TABLE "qna_boxes" DROP COLUMN "stickerRotation",
DROP COLUMN "stickerScale",
DROP COLUMN "stickerX",
DROP COLUMN "stickerY",
DROP COLUMN "storyId";
