/*
  Warnings:

  - The `status` column on the `platform_subscriptions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `isPrivate` on the `profiles` table. All the data in the column will be lost.
  - The `status` column on the `promotions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `reports` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[yearlyStripePriceId]` on the table `platform_plans` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `action` on the `admin_audit_logs` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `targetType` on the `promotions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `targetType` on the `reports` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContentRating" AS ENUM ('GENERAL', 'MATURE');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('USER', 'POST', 'COMMENT', 'STORY', 'MESSAGE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'REVIEWING', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AdminAction" AS ENUM ('BAN_USER', 'UNBAN_USER', 'DELETE_USER', 'PROMOTE_USER', 'DEMOTE_USER', 'UPDATE_USER_STATUS', 'DELETE_POST', 'DELETE_COMMENT', 'DELETE_STORY', 'CONTENT_REMOVED', 'CONTENT_RESTRICTED', 'CONTENT_LABELED', 'REPORT_REVIEWED', 'REPORT_RESOLVED', 'REPORT_DISMISSED', 'REPORT_ESCALATED', 'UPDATE_WHITELIST', 'DELETE_WHITELIST', 'ACCOUNT_WARNED', 'ACCOUNT_SUSPENDED', 'ACCOUNT_RESTORED', 'SUBSCRIPTION_ADJUSTED', 'SUBSCRIPTION_CANCELLED', 'PROMOTION_REJECTED', 'CREATE_AUDIO', 'UPDATE_AUDIO', 'DELETE_AUDIO', 'MANUAL_OVERRIDE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIALING', 'PAST_DUE', 'INCOMPLETE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PromotionTargetType" AS ENUM ('POST', 'STORY', 'PROFILE');

-- AlterTable
ALTER TABLE "admin_audit_logs" DROP COLUMN "action",
ADD COLUMN     "action" "AdminAction" NOT NULL;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "reportId" TEXT,
ADD COLUMN     "storyId" TEXT,
ADD COLUMN     "targetId" TEXT,
ADD COLUMN     "targetType" TEXT;

-- AlterTable
ALTER TABLE "platform_plans" ADD COLUMN     "yearlyPrice" DOUBLE PRECISION,
ADD COLUMN     "yearlyStripePriceId" TEXT,
ALTER COLUMN "currency" SET DEFAULT 'EUR';

-- AlterTable
ALTER TABLE "platform_subscriptions" DROP COLUMN "status",
ADD COLUMN     "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "contentRating" "ContentRating" NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "profiles" DROP COLUMN "isPrivate";

-- AlterTable
ALTER TABLE "promotions" ADD COLUMN     "chargedAt" TIMESTAMP(3),
ADD COLUMN     "refundPolicy" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "stripePaymentIntentId" TEXT,
DROP COLUMN "targetType",
ADD COLUMN     "targetType" "PromotionTargetType" NOT NULL,
ALTER COLUMN "currency" SET DEFAULT 'EUR',
DROP COLUMN "status",
ADD COLUMN     "status" "PromotionStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "reports" ALTER COLUMN "reason" SET DEFAULT 'other',
DROP COLUMN "status",
ADD COLUMN     "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
DROP COLUMN "targetType",
ADD COLUMN     "targetType" "ReportTargetType" NOT NULL;

-- AlterTable
ALTER TABLE "search_history" ADD COLUMN     "expiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "privacyLevel" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "contentPreference" "ContentRating" NOT NULL DEFAULT 'GENERAL',
    "blurSensitiveContent" BOOLEAN NOT NULL DEFAULT true,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "pushNotifications" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_userId_key" ON "user_settings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_plans_yearlyStripePriceId_key" ON "platform_plans"("yearlyStripePriceId");

-- CreateIndex
CREATE INDEX "platform_subscriptions_status_idx" ON "platform_subscriptions"("status");

-- CreateIndex
CREATE INDEX "posts_contentRating_idx" ON "posts"("contentRating");

-- CreateIndex
CREATE INDEX "promotions_status_idx" ON "promotions"("status");

-- CreateIndex
CREATE INDEX "reports_targetType_targetId_idx" ON "reports"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "search_history_expiresAt_idx" ON "search_history"("expiresAt");

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
