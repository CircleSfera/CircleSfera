-- Two columns of the removed paid content review: whether staff passed a post
-- or story, and when a post's content was last edited. Since #1114 nothing
-- reads or writes them, and the image this release replaces maps them with
-- @ignore, so a rollback never names them in a query.

-- @migration-safe: unread and unwritten since #1114; the previous image ignores it.
ALTER TABLE "posts" DROP COLUMN IF EXISTS "moderationPassedByStaff";
-- @migration-safe: unread and unwritten since #1114; the previous image ignores it.
ALTER TABLE "posts" DROP COLUMN IF EXISTS "contentEditedAt";
-- @migration-safe: unread and unwritten since #1114; the previous image ignores it.
ALTER TABLE "stories" DROP COLUMN IF EXISTS "moderationPassedByStaff";
