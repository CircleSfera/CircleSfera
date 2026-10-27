CREATE INDEX CONCURRENTLY IF NOT EXISTS "posts_profileId_archivedAt_idx" ON "posts"("profileId", "archivedAt");
