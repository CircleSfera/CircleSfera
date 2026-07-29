/*
  Warnings:

  - You are about to drop the column `subscriptionPriceCents` on the `profiles` table. All the data in the column will be lost.
  - You are about to drop the `creator_subscriptions` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT';
ALTER TYPE "NotificationType" ADD VALUE 'SYSTEM';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReportTargetType" ADD VALUE 'PAYMENT';
ALTER TYPE "ReportTargetType" ADD VALUE 'SYSTEM';

-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'DIRECT_MESSAGE_UNLOCK';

-- DropForeignKey
ALTER TABLE "creator_subscriptions" DROP CONSTRAINT "creator_subscriptions_creatorId_fkey";

-- DropForeignKey
ALTER TABLE "creator_subscriptions" DROP CONSTRAINT "creator_subscriptions_subscriberId_fkey";

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "isLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priceCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "profiles" DROP COLUMN "subscriptionPriceCents";

-- AlterTable
ALTER TABLE "promotions" ADD COLUMN     "clicks" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "messageId" TEXT;

-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN     "isOnboarded" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "creator_subscriptions";

-- CreateTable
CREATE TABLE "message_unlocks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "pricePaid" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_unlocks_userId_messageId_key" ON "message_unlocks"("userId", "messageId");

-- AddForeignKey
ALTER TABLE "message_unlocks" ADD CONSTRAINT "message_unlocks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_unlocks" ADD CONSTRAINT "message_unlocks_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
