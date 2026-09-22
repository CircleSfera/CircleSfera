-- Financial records retention: change onDelete from CASCADE to SET NULL for
-- StripePayoutLog and PlatformSubscription so that these rows survive user
-- hard-deletion for fiscal audit compliance (7-year retention window).
--
-- StripePayoutLog
ALTER TABLE "stripe_payout_logs" DROP CONSTRAINT IF EXISTS "stripe_payout_logs_userId_fkey";
ALTER TABLE "stripe_payout_logs" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "stripe_payout_logs"
  ADD CONSTRAINT "stripe_payout_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PlatformSubscription
ALTER TABLE "platform_subscriptions" DROP CONSTRAINT IF EXISTS "platform_subscriptions_userId_fkey";
ALTER TABLE "platform_subscriptions" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "platform_subscriptions"
  ADD CONSTRAINT "platform_subscriptions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
