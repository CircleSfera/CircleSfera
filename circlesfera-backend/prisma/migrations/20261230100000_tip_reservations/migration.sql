-- A tip being paid holds its amount against the payer's weekly limit while
-- its checkout is open. A new, empty table: nothing is rewritten.
CREATE TABLE "tip_reservations" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tip_reservations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tip_reservations_senderId_expiresAt_idx" ON "tip_reservations"("senderId", "expiresAt");
