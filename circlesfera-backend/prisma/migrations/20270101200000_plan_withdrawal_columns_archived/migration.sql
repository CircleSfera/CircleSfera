-- Withdrawals are made in one request since #1131: the bookkeeping the
-- reconcile job used to finish them later (the invoice and payment, the
-- refund key, the attempts and the next one) leaves platform_subscriptions.
-- What it holds is kept first in an archive table (owner decision,
-- 2026-11-24).

-- Refused while a withdrawal marked the old way is still unfinished: it
-- would never be finished. Finish it (or end it in the provider's
-- Dashboard and set withdrawalFinishedAt) and deploy again: the refusal
-- changes nothing, and scripts/prisma-migrate-deploy.sh marks it rolled
-- back and applies it again.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "platform_subscriptions"
    WHERE "withdrawnAt" IS NOT NULL
      AND "withdrawalFinishedAt" IS NULL
      AND "withdrawalNextAttemptAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A plan withdrawal marked before withdrawals were made in one request is not finished; finish it before this migration';
  END IF;
END $$;

-- CreateTable
CREATE TABLE "platform_subscription_withdrawal_archive" (
    "platformSubscriptionId" TEXT NOT NULL,
    "withdrawalInvoiceId" TEXT,
    "withdrawalPaymentIntentId" TEXT,
    "withdrawalRefundKey" TEXT,
    "withdrawalAttempts" INTEGER NOT NULL,
    "withdrawalNextAttemptAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_subscription_withdrawal_archive_pkey" PRIMARY KEY ("platformSubscriptionId")
);

-- Every row that holds any of it.
INSERT INTO "platform_subscription_withdrawal_archive" (
    "platformSubscriptionId",
    "withdrawalInvoiceId",
    "withdrawalPaymentIntentId",
    "withdrawalRefundKey",
    "withdrawalAttempts",
    "withdrawalNextAttemptAt"
)
SELECT
    "id",
    "withdrawalInvoiceId",
    "withdrawalPaymentIntentId",
    "withdrawalRefundKey",
    "withdrawalAttempts",
    "withdrawalNextAttemptAt"
FROM "platform_subscriptions"
WHERE "withdrawalInvoiceId" IS NOT NULL
   OR "withdrawalPaymentIntentId" IS NOT NULL
   OR "withdrawalRefundKey" IS NOT NULL
   OR "withdrawalAttempts" > 0
   OR "withdrawalNextAttemptAt" IS NOT NULL;

-- AlterTable
ALTER TABLE "platform_subscriptions" DROP COLUMN "withdrawalAttempts",
DROP COLUMN "withdrawalInvoiceId",
DROP COLUMN "withdrawalNextAttemptAt",
DROP COLUMN "withdrawalPaymentIntentId",
DROP COLUMN "withdrawalRefundKey";
