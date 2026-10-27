-- Content removed by moderation is kept, hidden from everyone, for the six
-- months its author has to appeal, then erased. Stories and comments record
-- when they were hidden or removed, as posts already do.
ALTER TABLE "stories" ADD COLUMN "moderatedAt" TIMESTAMP(3);
ALTER TABLE "comments" ADD COLUMN "moderatedAt" TIMESTAMP(3);

-- Decisions already in force have no recorded time. A comment's last change
-- is never earlier than the decision. A story has no such time: its six
-- months count from now, so nothing is erased sooner than it should be.
UPDATE "comments" SET "moderatedAt" = "updatedAt"
  WHERE "moderationStatus" IN ('HIDDEN', 'REMOVED');
UPDATE "stories" SET "moderatedAt" = CURRENT_TIMESTAMP
  WHERE "moderationStatus" IN ('HIDDEN', 'REMOVED');

-- The nightly erasure looks up removed content by when it was removed.
CREATE INDEX "stories_moderationStatus_moderatedAt_idx" ON "stories"("moderationStatus", "moderatedAt");
CREATE INDEX "comments_moderationStatus_moderatedAt_idx" ON "comments"("moderationStatus", "moderatedAt");
