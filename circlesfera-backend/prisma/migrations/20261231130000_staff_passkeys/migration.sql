-- Staff passkeys: a name to tell them apart, when each was last used, and
-- the challenges of their ceremonies; adding or removing one is audited.
ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'ADMIN_PASSKEY_ADDED';
ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'ADMIN_PASSKEY_REMOVED';

ALTER TABLE "admin_passkeys" ADD COLUMN "name" TEXT;
ALTER TABLE "admin_passkeys" ADD COLUMN "lastUsedAt" TIMESTAMP(3);

CREATE TABLE "admin_passkey_challenges" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "scope" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_passkey_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_passkey_challenges_challenge_key" ON "admin_passkey_challenges"("challenge");
CREATE INDEX "admin_passkey_challenges_expiresAt_idx" ON "admin_passkey_challenges"("expiresAt");

ALTER TABLE "admin_passkey_challenges" ADD CONSTRAINT "admin_passkey_challenges_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
