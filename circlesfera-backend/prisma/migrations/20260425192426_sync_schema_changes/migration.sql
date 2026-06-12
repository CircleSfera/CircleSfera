/*
  Warnings:

  - You are about to drop the column `currency` on the `posts` table. All the data in the column will be lost.
  - You are about to drop the column `isPremium` on the `posts` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `posts` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `stories` table. All the data in the column will be lost.
  - You are about to drop the column `isPremium` on the `stories` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `stories` table. All the data in the column will be lost.
  - You are about to drop the column `isMonetizationEnabled` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `providerAccountId` on the `users` table. All the data in the column will be lost.
  - You are about to drop the `purchases` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[stripeCustomerId]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'FOLLOWERS', 'PRIVATE');

-- DropForeignKey
ALTER TABLE "purchases" DROP CONSTRAINT "purchases_buyerId_fkey";

-- DropForeignKey
ALTER TABLE "purchases" DROP CONSTRAINT "purchases_sellerId_fkey";

-- DropIndex
DROP INDEX "posts_userId_type_createdAt_idx";

-- AlterTable
ALTER TABLE "posts" DROP COLUMN "currency",
DROP COLUMN "isPremium",
DROP COLUMN "price",
ADD COLUMN     "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC';

-- AlterTable
ALTER TABLE "stories" DROP COLUMN "currency",
DROP COLUMN "isPremium",
DROP COLUMN "price";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "isMonetizationEnabled",
DROP COLUMN "providerAccountId",
ADD COLUMN     "stripeCustomerId" TEXT;

-- DropTable
DROP TABLE "purchases";

-- CreateTable
CREATE TABLE "platform_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "interval" TEXT NOT NULL DEFAULT 'month',
    "stripeProductId" TEXT NOT NULL,
    "stripePriceId" TEXT NOT NULL,
    "features" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "stripeSubscriptionId" TEXT NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_plans_stripeProductId_key" ON "platform_plans"("stripeProductId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_plans_stripePriceId_key" ON "platform_plans"("stripePriceId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_subscriptions_stripeSubscriptionId_key" ON "platform_subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "platform_subscriptions_userId_idx" ON "platform_subscriptions"("userId");

-- CreateIndex
CREATE INDEX "platform_subscriptions_status_idx" ON "platform_subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "platform_subscriptions_userId_planId_key" ON "platform_subscriptions"("userId", "planId");

-- CreateIndex
CREATE INDEX "posts_userId_type_visibility_createdAt_idx" ON "posts"("userId", "type", "visibility", "createdAt");

-- CreateIndex
CREATE INDEX "posts_visibility_idx" ON "posts"("visibility");

-- CreateIndex
CREATE UNIQUE INDEX "users_stripeCustomerId_key" ON "users"("stripeCustomerId");

-- AddForeignKey
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_subscriptions" ADD CONSTRAINT "platform_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "platform_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
