-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "userAgent" TEXT,
ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;
