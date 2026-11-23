-- How often a platform subscription is charged, as the provider's price
-- says (BD-016): every subscription so far is monthly. Additive: the
-- previous image never names it.
ALTER TABLE "platform_subscriptions" ADD COLUMN "billingInterval" TEXT NOT NULL DEFAULT 'month';

-- What each period costs, as the provider's price says, in cents.
ALTER TABLE "platform_subscriptions" ADD COLUMN "periodPriceCents" INTEGER;

-- When a monthly plan moved to the yearly price: the 14 days to withdraw
-- from that year count from then.
ALTER TABLE "platform_subscriptions" ADD COLUMN "yearlyStartedAt" TIMESTAMP(3);

-- When a request to move it to the yearly price claimed the move: one
-- request at a time.
ALTER TABLE "platform_subscriptions" ADD COLUMN "yearlyMoveClaimedAt" TIMESTAMP(3);
