CREATE INDEX CONCURRENTLY IF NOT EXISTS "comments_moderationStatus_moderatedAt_idx" ON "comments"("moderationStatus", "moderatedAt");
