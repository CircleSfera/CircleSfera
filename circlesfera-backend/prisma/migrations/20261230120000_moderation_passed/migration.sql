-- When automatic moderation checked a post or story and found nothing: only
-- then is it sold or tipped. Nullable columns, so no table is rewritten;
-- every existing row is unchecked until moderation checks it.
ALTER TABLE "posts" ADD COLUMN "moderationPassedAt" TIMESTAMP(3);
ALTER TABLE "stories" ADD COLUMN "moderationPassedAt" TIMESTAMP(3);
