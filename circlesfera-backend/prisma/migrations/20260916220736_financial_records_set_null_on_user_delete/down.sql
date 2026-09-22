-- Rollback script for migration 20260916220736_financial_records_set_null_on_user_delete
-- Reverts onDelete: SET NULL back to CASCADE and re-enforces NOT NULL on userId.

-- StripePayoutLog
ALTER TABLE "stripe_payout_logs" DROP CONSTRAINT IF EXISTS "stripe_payout_logs_userId_fkey";
ALTER TABLE "stripe_payout_logs" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "stripe_payout_logs"
  ADD CONSTRAINT "stripe_payout_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PlatformSubscription
ALTER TABLE "platform_subscriptions" DROP CONSTRAINT IF EXISTS "platform_subscriptions_userId_fkey";
ALTER TABLE "platform_subscriptions" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "platform_subscriptions"
  ADD CONSTRAINT "platform_subscriptions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
