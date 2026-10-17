-- A rejected promotion is told why, and may be appealed once.
ALTER TABLE "promotions" ADD COLUMN "rejectionReason" TEXT;
ALTER TYPE "AppealTargetType" ADD VALUE 'PROMOTION_REJECTION';
