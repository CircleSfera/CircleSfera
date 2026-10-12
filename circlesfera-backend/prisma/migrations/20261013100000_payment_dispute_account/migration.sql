-- The account that paid a disputed payment, so that a dispute of a plan
-- invoice, which has no transaction, also says whose it is.
ALTER TABLE "payment_disputes" ADD COLUMN "userId" TEXT;

CREATE INDEX "payment_disputes_userId_idx" ON "payment_disputes"("userId");

ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A dispute with a transaction is of who sent that payment.
UPDATE "payment_disputes" d
SET "userId" = t."senderId"
FROM "transactions" t
WHERE d."transactionId" = t."id" AND t."senderId" IS NOT NULL;
