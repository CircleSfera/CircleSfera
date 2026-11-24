-- A subscription the payment provider has stopped trying to collect
-- (Stripe "unpaid") is told apart from one it is still trying (PAST_DUE):
-- the plan keeps what it gives while the provider tries again, and stops
-- once it no longer does. Rows already PAST_DUE are read again from the
-- provider by its next notice.
ALTER TYPE "SubscriptionStatus" ADD VALUE 'UNPAID';
