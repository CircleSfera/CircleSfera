-- AlterTable
ALTER TABLE "promotions" ADD COLUMN     "countries" TEXT,
ADD COLUMN     "dailyBudget" DOUBLE PRECISION,
ADD COLUMN     "interests" TEXT,
ADD COLUMN     "objective" TEXT DEFAULT 'PROFILE_VISITS';
