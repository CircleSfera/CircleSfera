-- A withdrawal from a plan within 14 days of the purchase: when it was
-- made, the refund owed for the unused part (cents), the provider's refund
-- and when every step was done. All empty for a plan never withdrawn.
ALTER TABLE "platform_subscriptions" ADD COLUMN "withdrawnAt" TIMESTAMP(3),
ADD COLUMN "withdrawalRefundCents" INTEGER,
ADD COLUMN "withdrawalRefundId" TEXT,
ADD COLUMN "withdrawalFinishedAt" TIMESTAMP(3);
