/*
  Warnings:

  - You are about to drop the column `stripeSessionId` on the `purchases` table. All the data in the column will be lost.
  - You are about to drop the column `stripeAccountId` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[externalSessionId]` on the table `purchases` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "purchases_stripeSessionId_key";

-- AlterTable
ALTER TABLE "purchases" DROP COLUMN "stripeSessionId",
ADD COLUMN     "externalSessionId" TEXT,
ADD COLUMN     "invoiceUrl" TEXT,
ADD COLUMN     "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'simulator',
ADD COLUMN     "providerTransferId" TEXT,
ADD COLUMN     "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "users" DROP COLUMN "stripeAccountId",
ADD COLUMN     "providerAccountId" TEXT;

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_externalId_key" ON "webhook_events"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_externalSessionId_key" ON "purchases"("externalSessionId");
