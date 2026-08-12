-- CreateTable
CREATE TABLE "stripe_payout_logs" (
    "id" TEXT NOT NULL,
    "stripePayoutId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL,
    "arrivalDate" TIMESTAMP(3) NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_payout_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stripe_payout_logs_stripePayoutId_key" ON "stripe_payout_logs"("stripePayoutId");

-- CreateIndex
CREATE INDEX "stripe_payout_logs_status_idx" ON "stripe_payout_logs"("status");

-- AddForeignKey
ALTER TABLE "stripe_payout_logs" ADD CONSTRAINT "stripe_payout_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
