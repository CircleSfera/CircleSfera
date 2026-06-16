-- AlterTable
ALTER TABLE "stories" ADD COLUMN     "isPremium" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priceCents" INTEGER NOT NULL DEFAULT 0;

