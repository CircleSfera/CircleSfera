-- Notices of illegal content from anyone, with or without an account
-- (Digital Services Act Art. 16): what is reported, why it is illegal, who
-- notifies (optional for child sexual abuse material) and what staff decided.

-- CreateEnum
CREATE TYPE "IllegalNoticeStatus" AS ENUM ('RECEIVED', 'ACTIONED', 'NO_ACTION');

-- CreateTable
CREATE TABLE "illegal_content_notices" (
    "id" TEXT NOT NULL,
    "contentUrl" VARCHAR(2048) NOT NULL,
    "explanation" VARCHAR(5000) NOT NULL,
    "childAbuse" BOOLEAN NOT NULL DEFAULT false,
    "notifierName" VARCHAR(200),
    "notifierEmail" VARCHAR(320),
    "goodFaith" BOOLEAN NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'es',
    "status" "IllegalNoticeStatus" NOT NULL DEFAULT 'RECEIVED',
    "decision" VARCHAR(5000),
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "illegal_content_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "illegal_content_notices_status_createdAt_idx" ON "illegal_content_notices"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "illegal_content_notices" ADD CONSTRAINT "illegal_content_notices_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "admin_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

