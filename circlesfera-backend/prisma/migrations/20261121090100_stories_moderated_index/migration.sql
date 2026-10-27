CREATE INDEX CONCURRENTLY IF NOT EXISTS "stories_moderationStatus_moderatedAt_idx" ON "stories"("moderationStatus", "moderatedAt");
