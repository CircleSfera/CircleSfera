-- AlterEnum: allow pausing paid campaigns without cancelling / refunding
ALTER TYPE "PromotionStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
