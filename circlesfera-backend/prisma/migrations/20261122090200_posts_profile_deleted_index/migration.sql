CREATE INDEX CONCURRENTLY IF NOT EXISTS "posts_profileId_deletedAt_idx" ON "posts"("profileId", "deletedAt");
