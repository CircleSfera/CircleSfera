-- The recurring monthly income kept once a day, so that the Backoffice can
-- compare today with earlier days. Amounts are integer cents.
CREATE TABLE "recurring_income_days" (
    "day" DATE NOT NULL,
    "mrrCents" INTEGER NOT NULL,
    "activeSubscriptions" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_income_days_pkey" PRIMARY KEY ("day")
);
