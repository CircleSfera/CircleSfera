-- Disputes opened at the payment provider, mirrored for staff.
CREATE TABLE "payment_disputes" (
    "id" TEXT NOT NULL,
    "stripeDisputeId" TEXT NOT NULL,
    "stripeChargeId" TEXT,
    "stripePaymentIntentId" TEXT,
    "transactionId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "evidenceDueBy" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_disputes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_disputes_stripeDisputeId_key" ON "payment_disputes"("stripeDisputeId");
CREATE INDEX "payment_disputes_status_idx" ON "payment_disputes"("status");
CREATE INDEX "payment_disputes_evidenceDueBy_idx" ON "payment_disputes"("evidenceDueBy");
CREATE INDEX "payment_disputes_transactionId_idx" ON "payment_disputes"("transactionId");

ALTER TABLE "payment_disputes"
  ADD CONSTRAINT "payment_disputes_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
