-- Spam and bot detection: Profiles flagged for human review, with their
-- signals, temporary restriction and staff decision.

-- CreateEnum
CREATE TYPE "RiskCaseStatus" AS ENUM ('OPEN', 'DISMISSED', 'ACTIONED');

-- CreateEnum
CREATE TYPE "RiskCaseDecision" AS ENUM ('DISMISSED', 'BOT_LABEL', 'RESTRICTED', 'SUSPENDED', 'BANNED');

-- AlterEnum
ALTER TYPE "AdminAction" ADD VALUE 'RISK_CASE_RESOLVED';

-- AlterEnum
ALTER TYPE "AppealTargetType" ADD VALUE 'RESTRICTION';

-- CreateTable
CREATE TABLE "risk_cases" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "signals" JSONB NOT NULL,
    "status" "RiskCaseStatus" NOT NULL DEFAULT 'OPEN',
    "restrictedUntil" TIMESTAMP(3),
    "decision" "RiskCaseDecision",
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "risk_cases_profileId_status_idx" ON "risk_cases"("profileId", "status");

-- CreateIndex
CREATE INDEX "risk_cases_status_score_idx" ON "risk_cases"("status", "score");

-- CreateIndex
CREATE INDEX "risk_cases_status_updatedAt_idx" ON "risk_cases"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "risk_cases" ADD CONSTRAINT "risk_cases_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_cases" ADD CONSTRAINT "risk_cases_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "admin_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

