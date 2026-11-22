-- A withdrawal from a plan within 14 days of the purchase: when it was
-- made, the refund owed for the unused part (cents), the invoice and payment
-- it is refunded from, the provider's refund and its idempotency key, the
-- attempts to finish it and when the next is due, and when every step was
-- done. All empty for a plan never withdrawn. Also when the subscription
-- started at the provider, from which the 14 days count.
ALTER TABLE "platform_subscriptions" ADD COLUMN "withdrawnAt" TIMESTAMP(3),
ADD COLUMN "withdrawalRefundCents" INTEGER,
ADD COLUMN "withdrawalRefundId" TEXT,
ADD COLUMN "withdrawalFinishedAt" TIMESTAMP(3),
ADD COLUMN "withdrawalInvoiceId" TEXT,
ADD COLUMN "withdrawalPaymentIntentId" TEXT,
ADD COLUMN "withdrawalRefundKey" TEXT,
ADD COLUMN "withdrawalAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "withdrawalNextAttemptAt" TIMESTAMP(3),
ADD COLUMN "providerStartedAt" TIMESTAMP(3);
