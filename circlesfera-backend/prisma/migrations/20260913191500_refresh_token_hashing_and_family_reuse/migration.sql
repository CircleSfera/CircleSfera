-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "familyId" TEXT,
ADD COLUMN IF NOT EXISTS "isRevoked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");
