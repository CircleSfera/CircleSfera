-- AlterTable
ALTER TABLE "participants" ADD COLUMN "hasAccepted" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "participants_profileId_deletedAt_hasAccepted_idx" ON "participants"("profileId", "deletedAt", "hasAccepted");
