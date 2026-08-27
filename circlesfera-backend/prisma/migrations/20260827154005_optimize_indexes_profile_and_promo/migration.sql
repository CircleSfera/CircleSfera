-- Drop redundant single-column indexes already covered by composites/uniques.
-- IF EXISTS: migration history still uses userId-era names on a fresh migrate deploy;
-- local/prod DBs that already completed the Profile split use profileId index names.
DROP INDEX IF EXISTS "bookmarks_profileId_idx";
DROP INDEX IF EXISTS "bookmarks_userId_idx";
DROP INDEX IF EXISTS "comments_postId_idx";
DROP INDEX IF EXISTS "follows_followerId_idx";
DROP INDEX IF EXISTS "follows_followingId_idx";
DROP INDEX IF EXISTS "likes_profileId_idx";
DROP INDEX IF EXISTS "likes_userId_idx";
DROP INDEX IF EXISTS "messages_conversationId_idx";
DROP INDEX IF EXISTS "notifications_recipientId_idx";
DROP INDEX IF EXISTS "posts_profileId_idx";
DROP INDEX IF EXISTS "posts_userId_idx";
DROP INDEX IF EXISTS "profile_metrics_profileId_date_idx";
DROP INDEX IF EXISTS "profiles_username_idx";
DROP INDEX IF EXISTS "promotions_stripePaymentIntentId_idx";
DROP INDEX IF EXISTS "stories_profileId_idx";
DROP INDEX IF EXISTS "stories_userId_idx";
DROP INDEX IF EXISTS "users_resetToken_idx";
DROP INDEX IF EXISTS "users_verificationToken_idx";

-- Add lookup indexes for account→profiles, reverse block/mute, promo delivery, scheduler, payouts.
CREATE INDEX IF NOT EXISTS "blocks_blockedId_idx" ON "blocks"("blockedId");
CREATE INDEX IF NOT EXISTS "mutes_mutedId_idx" ON "mutes"("mutedId");
CREATE INDEX IF NOT EXISTS "posts_scheduledStatus_scheduledAt_idx" ON "posts"("scheduledStatus", "scheduledAt");
CREATE INDEX IF NOT EXISTS "profiles_userId_idx" ON "profiles"("userId");
CREATE INDEX IF NOT EXISTS "promotions_targetType_targetId_idx" ON "promotions"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "promotions_status_endDate_idx" ON "promotions"("status", "endDate");
CREATE INDEX IF NOT EXISTS "stripe_payout_logs_userId_idx" ON "stripe_payout_logs"("userId");
