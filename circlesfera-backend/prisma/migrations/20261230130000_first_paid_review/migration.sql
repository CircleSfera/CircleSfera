-- Whether the moderation pass of a post or story was given by a person on
-- staff. The first priced items of each Profile are passed by a person
-- before automatic passes count. A constant default, so no table is
-- rewritten.
ALTER TABLE "posts" ADD COLUMN "moderationPassedByStaff" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "stories" ADD COLUMN "moderationPassedByStaff" BOOLEAN NOT NULL DEFAULT false;

-- When the author of a post last changed its caption or cover: staff pass a
-- post only as it was when they looked at it. Nullable, so no rewrite.
ALTER TABLE "posts" ADD COLUMN "contentEditedAt" TIMESTAMP(3);

-- No priced item has been passed by a person yet, so every Profile is under
-- the threshold: its priced items go off sale until staff passes them, and
-- they appear in the staff queue. Free items keep their pass.
UPDATE "posts" SET "moderationPassedAt" = NULL
WHERE "priceCents" > 0 AND "moderationPassedAt" IS NOT NULL;
UPDATE "stories" SET "moderationPassedAt" = NULL
WHERE "priceCents" > 0 AND "moderationPassedAt" IS NOT NULL;

ALTER TYPE "AdminAction" ADD VALUE 'PAID_CONTENT_APPROVED';
