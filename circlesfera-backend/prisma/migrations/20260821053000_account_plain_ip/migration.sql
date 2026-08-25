-- Store plaintext signup/last IP for account lifetime (T&S + transparency / GDPR export).
-- Hashes remain for clustering indexes.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signupIp" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastIp" TEXT;

CREATE INDEX IF NOT EXISTS "users_signupIp_idx" ON "users"("signupIp");
CREATE INDEX IF NOT EXISTS "users_lastIp_idx" ON "users"("lastIp");
