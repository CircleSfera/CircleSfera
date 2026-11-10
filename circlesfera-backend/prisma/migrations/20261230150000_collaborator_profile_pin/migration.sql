-- The collaborator of a post pins it on its own profile. Only adds a
-- nullable column and its index: nothing existing changes.
ALTER TABLE "post_collaborators" ADD COLUMN "pinnedAt" TIMESTAMP(3);

CREATE INDEX "post_collaborators_profileId_pinnedAt_idx" ON "post_collaborators"("profileId", "pinnedAt");
