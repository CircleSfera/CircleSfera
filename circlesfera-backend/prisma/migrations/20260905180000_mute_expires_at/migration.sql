-- Timed mutes: null expiresAt = forever (backward compatible with existing rows)
ALTER TABLE "mutes" ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE INDEX "mutes_muterId_expiresAt_idx" ON "mutes"("muterId", "expiresAt");
