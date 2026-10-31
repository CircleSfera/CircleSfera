-- The VAT a buyer paid on top of the price of a payment to a creator, in
-- cents. Payments made before VAT was charged had none.
ALTER TABLE "transactions" ADD COLUMN "vatCents" INTEGER NOT NULL DEFAULT 0;
