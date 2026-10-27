CREATE INDEX CONCURRENTLY IF NOT EXISTS "stories_profileId_deletedAt_idx" ON "stories"("profileId", "deletedAt");
