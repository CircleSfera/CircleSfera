-- CreateEnum
CREATE TYPE "VerificationLevel" AS ENUM ('BASIC', 'VERIFIED', 'BUSINESS', 'ELITE');
CREATE TYPE "AccountType" AS ENUM ('PERSONAL', 'CREATOR', 'BUSINESS');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "verificationLevel" "VerificationLevel" NOT NULL DEFAULT 'BASIC',
ADD COLUMN "accountType" "AccountType" NOT NULL DEFAULT 'PERSONAL';
