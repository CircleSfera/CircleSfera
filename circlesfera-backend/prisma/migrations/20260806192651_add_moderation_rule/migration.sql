-- CreateEnum
CREATE TYPE "RuleAction" AS ENUM ('BLOCK', 'FLAG', 'MUTE');

-- CreateTable
CREATE TABLE "moderation_rules" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "action" "RuleAction" NOT NULL DEFAULT 'FLAG',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moderation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "moderation_rules_keyword_key" ON "moderation_rules"("keyword");
