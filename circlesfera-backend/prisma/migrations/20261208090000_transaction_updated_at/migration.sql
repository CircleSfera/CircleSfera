-- When a payment last changed, so the nightly warehouse export takes it again
-- after a refund or a dispute. Existing rows start at the time of this release;
-- the next export takes all of them once.
ALTER TABLE "transactions" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "transactions_updatedAt_idx" ON "transactions"("updatedAt");
