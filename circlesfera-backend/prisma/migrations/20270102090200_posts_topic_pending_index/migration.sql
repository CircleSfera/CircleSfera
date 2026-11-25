-- The posts still without a topic, in id order: what the topic sweep reads.
-- Partial, so once every post has its topic the index (and each run of the
-- sweep) holds next to nothing. Prisma's schema cannot state a partial index;
-- it is kept here only, as the other partial indexes are.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "posts_topic_pending_idx" ON "posts"("id") WHERE "topic" IS NULL;
