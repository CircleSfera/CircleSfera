-- How each person chose their ads to be picked (PD-084): every answer is a
-- row, never changed, kept as the proof of consent (the choice, its date, the
-- version of the texts shown and their language). Erased with the account.

-- CreateEnum
CREATE TYPE "AdChoice" AS ENUM ('PERSONALISED', 'GENERAL');

-- CreateEnum
CREATE TYPE "AdConsentSource" AS ENUM ('PROMPT', 'SETTINGS');

-- CreateTable
CREATE TABLE "ad_consents" (
    "id" TEXT NOT NULL,
    -- The order answers were written in: the latest is the highest, even
    -- when two share a millisecond.
    "seq" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "choice" "AdChoice" NOT NULL,
    "textVersion" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "source" "AdConsentSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ad_consents_userId_seq_idx" ON "ad_consents"("userId", "seq");

-- AddForeignKey
ALTER TABLE "ad_consents" ADD CONSTRAINT "ad_consents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The screen and Settings → Ads stay hidden until the legal review (Ads 0)
-- is done: a flag, off, that staff turn on from Admin → Experiments.
INSERT INTO "feature_flags" (
  "id",
  "key",
  "name",
  "description",
  "isEnabled",
  "percentage",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  'ads_consent',
  'Ads: consent screen and Settings → Ads',
  'Shows "How should your ads be chosen?" after sign-up and once to existing accounts, and Settings → Ads (PD-084). Off until the legal review (Ads 0) is done.',
  false,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "feature_flags" WHERE "key" = 'ads_consent'
);
