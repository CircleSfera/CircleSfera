-- Decisions already in force have no recorded time. A comment's last change
-- is never earlier than the decision. A story has no such time: its six
-- months count from now, so nothing is erased sooner than it should be.
-- Only hidden and removed rows are read, through the indexes built just
-- before, and only those rows are locked.
UPDATE "comments" SET "moderatedAt" = "updatedAt"
  WHERE "moderationStatus" IN ('HIDDEN', 'REMOVED') AND "moderatedAt" IS NULL;
UPDATE "stories" SET "moderatedAt" = CURRENT_TIMESTAMP
  WHERE "moderationStatus" IN ('HIDDEN', 'REMOVED') AND "moderatedAt" IS NULL;
