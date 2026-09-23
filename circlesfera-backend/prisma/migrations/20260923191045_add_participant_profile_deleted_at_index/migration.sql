-- CreateIndex
CREATE INDEX "participants_profileId_deletedAt_idx" ON "participants"("profileId", "deletedAt");
