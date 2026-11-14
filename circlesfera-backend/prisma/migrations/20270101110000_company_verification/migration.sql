-- Company verification of Business Profiles: the applications and, until
-- staff decide, their encrypted documents. New tables only.

-- CreateEnum
CREATE TYPE "CompanyKind" AS ENUM ('COMPANY', 'SOLE_TRADER');

-- CreateEnum
CREATE TYPE "CompanyVerificationStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "company_verifications" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "status" "CompanyVerificationStatus" NOT NULL DEFAULT 'DRAFT',
    "kind" "CompanyKind" NOT NULL,
    "legalName" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "domain" TEXT,
    "viesValid" BOOLEAN,
    "viesName" TEXT,
    "viesCheckedAt" TIMESTAMP(3),
    "domainToken" TEXT NOT NULL,
    "domainProvedAt" TIMESTAMP(3),
    "domainProof" TEXT,
    "emailAddress" TEXT,
    "emailCodeHash" TEXT,
    "emailCodeExpiresAt" TIMESTAMP(3),
    "emailCodeTries" INTEGER NOT NULL DEFAULT 0,
    "emailVerifiedAt" TIMESTAMP(3),
    "emailCodeSentAt" TIMESTAMP(3),
    "emailCodeSends" INTEGER NOT NULL DEFAULT 0,
    "emailCodeSendsSince" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_verification_documents" (
    "id" TEXT NOT NULL,
    "verificationId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_verification_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_verifications_profileId_idx" ON "company_verifications"("profileId");

-- CreateIndex
CREATE INDEX "company_verifications_status_submittedAt_idx" ON "company_verifications"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "company_verification_documents_verificationId_idx" ON "company_verification_documents"("verificationId");

-- AddForeignKey
ALTER TABLE "company_verifications" ADD CONSTRAINT "company_verifications_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_verification_documents" ADD CONSTRAINT "company_verification_documents_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "company_verifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- At most one application being filled in or waiting for staff per Profile.
CREATE UNIQUE INDEX "company_verifications_one_open_per_profile"
ON "company_verifications" ("profileId")
WHERE "status" IN ('DRAFT', 'PENDING');
