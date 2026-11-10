-- A staff identity sets a password of its own; setting or changing it is audited.
ALTER TYPE "AdminAction" ADD VALUE IF NOT EXISTS 'ADMIN_PASSWORD_SET';

-- When the identity set its own staff password. Existing identities have
-- none yet and keep signing in with their linked account's password.
ALTER TABLE "admin_identities" ADD COLUMN "passwordSetAt" TIMESTAMP(3);
