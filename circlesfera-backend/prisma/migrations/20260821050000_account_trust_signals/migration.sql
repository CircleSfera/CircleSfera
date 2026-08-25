-- Account trust signals: hashed abuse identifiers, device clustering, staff bot label.

ALTER TYPE "AppealTargetType" ADD VALUE IF NOT EXISTS 'BOT_LABEL';
ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'ACCOUNT_BOT_LABELED';
ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'ACCOUNT_BOT_LABEL_CLEARED';

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signupIpHash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastIpHash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signupCountry" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "botLabeledAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "botLabelReason" TEXT;

CREATE TABLE IF NOT EXISTS "device_signals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "userAgentHash" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_signals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "users_signupIpHash_idx" ON "users"("signupIpHash");
CREATE INDEX IF NOT EXISTS "users_lastIpHash_idx" ON "users"("lastIpHash");
CREATE INDEX IF NOT EXISTS "users_botLabeledAt_idx" ON "users"("botLabeledAt");
CREATE UNIQUE INDEX IF NOT EXISTS "device_signals_userId_visitorHash_key" ON "device_signals"("userId", "visitorHash");
CREATE INDEX IF NOT EXISTS "device_signals_visitorHash_idx" ON "device_signals"("visitorHash");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'device_signals_userId_fkey'
  ) THEN
    ALTER TABLE "device_signals"
      ADD CONSTRAINT "device_signals_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
