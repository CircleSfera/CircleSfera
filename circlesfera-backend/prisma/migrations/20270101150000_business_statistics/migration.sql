-- The business statistics of a Business Profile: daily totals per visitor
-- country, never who visited or tapped.
CREATE TABLE "business_stat_days" (
    "profileId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "country" VARCHAR(2) NOT NULL DEFAULT '',
    "visits" INTEGER NOT NULL DEFAULT 0,
    "emailTaps" INTEGER NOT NULL DEFAULT 0,
    "callTaps" INTEGER NOT NULL DEFAULT 0,
    "addressTaps" INTEGER NOT NULL DEFAULT 0,
    "websiteTaps" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "business_stat_days_pkey" PRIMARY KEY ("profileId","day","country")
);

CREATE INDEX "business_stat_days_day_idx" ON "business_stat_days"("day");

ALTER TABLE "business_stat_days" ADD CONSTRAINT "business_stat_days_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
