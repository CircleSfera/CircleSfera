-- What the buyer got back of a payment by refunds, in cents. Payments
-- refunded in full were marked REFUNDED and keep 0.
ALTER TABLE "transactions" ADD COLUMN "refundedCents" INTEGER NOT NULL DEFAULT 0;

-- A payment with an open dispute: held until the dispute is settled.
ALTER TYPE "TransactionStatus" ADD VALUE 'DISPUTED';
