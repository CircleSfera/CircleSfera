-- Strikes are recorded per Profile with their rule, expiry and consequence.
-- Production has no strikes to carry over (verified by the sanctions report).

-- CreateEnum
CREATE TYPE "ProfileStrikeKind" AS ENUM ('WARNING', 'STRIKE');

-- CreateEnum
CREATE TYPE "ProfileStrikeConsequence" AS ENUM ('NONE', 'SUSPENDED', 'BANNED');

-- AlterEnum
ALTER TYPE "AppealTargetType" ADD VALUE 'STRIKE';

-- CreateTable
CREATE TABLE "profile_strikes" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" "ProfileStrikeKind" NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "consequence" "ProfileStrikeConsequence" NOT NULL DEFAULT 'NONE',
    "reportId" TEXT,
    "adminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "profile_strikes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profile_strikes_profileId_expiresAt_idx" ON "profile_strikes"("profileId", "expiresAt");

-- CreateIndex
CREATE INDEX "profile_strikes_reportId_idx" ON "profile_strikes"("reportId");

-- AddForeignKey
ALTER TABLE "profile_strikes" ADD CONSTRAINT "profile_strikes_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_strikes" ADD CONSTRAINT "profile_strikes_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_strikes" ADD CONSTRAINT "profile_strikes_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

