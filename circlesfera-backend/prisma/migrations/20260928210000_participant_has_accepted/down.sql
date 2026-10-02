-- DropIndex
DROP INDEX IF EXISTS "participants_profileId_deletedAt_hasAccepted_idx";

-- AlterTable
ALTER TABLE "participants" DROP COLUMN IF EXISTS "hasAccepted";
