/*
  Warnings:

  - The values [IN_PROGRESS] on the enum `TicketStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `description` on the `support_tickets` table. All the data in the column will be lost.
  - You are about to drop the column `priority` on the `support_tickets` table. All the data in the column will be lost.
  - Added the required column `email` to the `support_tickets` table without a default value. This is not possible if the table is not empty.
  - Added the required column `message` to the `support_tickets` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UserEventType" AS ENUM ('IMPRESSION', 'VIEW_START', 'VIEW_COMPLETE', 'DWELL_TIME', 'LIKE', 'COMMENT', 'SAVE', 'SHARE', 'HIDE', 'REPORT', 'PROFILE_CLICK', 'FOLLOW', 'SUBSCRIPTION_CLICK', 'SUBSCRIPTION_SUCCESS', 'SPONSORED_PLACEMENT_CLICK');

-- AlterEnum
ALTER TYPE "ReportReason" ADD VALUE 'SCAM';

-- AlterEnum
BEGIN;
CREATE TYPE "TicketStatus_new" AS ENUM ('OPEN', 'RESOLVED', 'CLOSED');
ALTER TABLE "public"."support_tickets" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "support_tickets" ALTER COLUMN "status" TYPE "TicketStatus_new" USING ("status"::text::"TicketStatus_new");
ALTER TYPE "TicketStatus" RENAME TO "TicketStatus_old";
ALTER TYPE "TicketStatus_new" RENAME TO "TicketStatus";
DROP TYPE "public"."TicketStatus_old";
ALTER TABLE "support_tickets" ALTER COLUMN "status" SET DEFAULT 'OPEN';
COMMIT;

-- DropForeignKey
ALTER TABLE "support_tickets" DROP CONSTRAINT "support_tickets_userId_fkey";

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "avatarUrl" TEXT;

-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "support_tickets" DROP COLUMN "description",
DROP COLUMN "priority",
ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "message" TEXT NOT NULL,
ADD COLUMN     "reply" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "moderation_signatures" (
    "id" TEXT NOT NULL,
    "vector" vector(1536) NOT NULL,
    "category" TEXT NOT NULL,
    "textPreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interaction_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" "UserEventType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "dwellTime" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interaction_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interaction_events_userId_idx" ON "interaction_events"("userId");

-- CreateIndex
CREATE INDEX "interaction_events_eventType_idx" ON "interaction_events"("eventType");

-- CreateIndex
CREATE INDEX "interaction_events_targetId_eventType_idx" ON "interaction_events"("targetId", "eventType");

-- CreateIndex
CREATE INDEX "interaction_events_createdAt_idx" ON "interaction_events"("createdAt");

-- CreateIndex
CREATE INDEX "conversations_updatedAt_idx" ON "conversations"("updatedAt");

-- CreateIndex
CREATE INDEX "follows_followingId_status_idx" ON "follows"("followingId", "status");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notifications_targetType_targetId_idx" ON "notifications"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "posts_moderationStatus_visibility_createdAt_idx" ON "posts"("moderationStatus", "visibility", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaction_events" ADD CONSTRAINT "interaction_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
