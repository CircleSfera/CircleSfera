/*
  Warnings:

  - The `refundPolicy` column on the `promotions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `reason` column on the `reports` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[stripePaymentIntentId]` on the table `promotions` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `type` on the `notifications` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LIKE', 'COMMENT', 'FOLLOW', 'FOLLOW_REQUEST', 'FOLLOW_ACCEPTED', 'MENTION', 'COMMENT_LIKE', 'MODERATION', 'SUBSCRIPTION', 'MESSAGE', 'REPLY_MESSAGE');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'ILLEGAL_CONTENT', 'VIOLENCE', 'HATE_SPEECH', 'IMPERSONATION', 'CSAM', 'OTHER');

-- CreateEnum
CREATE TYPE "PromotionRefundPolicy" AS ENUM ('PROPORTIONAL', 'NONE');

-- AlterEnum
ALTER TYPE "PromotionStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "messageId" TEXT,
DROP COLUMN "type",
ADD COLUMN     "type" "NotificationType" NOT NULL;

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "cover" TEXT,
ADD COLUMN     "coverStandardUrl" TEXT,
ADD COLUMN     "coverThumbnailUrl" TEXT;

-- AlterTable
ALTER TABLE "promotions" DROP COLUMN "refundPolicy",
ADD COLUMN     "refundPolicy" "PromotionRefundPolicy" NOT NULL DEFAULT 'PROPORTIONAL';

-- AlterTable
ALTER TABLE "reports" DROP COLUMN "reason",
ADD COLUMN     "reason" "ReportReason" NOT NULL DEFAULT 'OTHER';

-- CreateIndex
CREATE INDEX "notifications_recipientId_type_createdAt_idx" ON "notifications"("recipientId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_stripePaymentIntentId_key" ON "promotions"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "promotions_stripePaymentIntentId_idx" ON "promotions"("stripePaymentIntentId");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
