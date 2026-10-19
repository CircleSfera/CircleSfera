-- The Profile a tip was given to, kept with the tip. Only added; existing
-- rows keep it empty.
ALTER TABLE "transactions" ADD COLUMN "receiverProfileId" TEXT;

CREATE INDEX "transactions_receiverProfileId_idx" ON "transactions"("receiverProfileId");

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_receiverProfileId_fkey" FOREIGN KEY ("receiverProfileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
