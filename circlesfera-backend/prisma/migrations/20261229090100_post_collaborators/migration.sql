-- The one collaborator of a post or Frame: invited by its author, a
-- co-author once it accepts.

CREATE TYPE "CollaborationStatus" AS ENUM ('PENDING', 'ACCEPTED');

CREATE TABLE "post_collaborators" (
    "postId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "status" "CollaborationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "post_collaborators_pkey" PRIMARY KEY ("postId")
);

CREATE INDEX "post_collaborators_profileId_status_idx" ON "post_collaborators"("profileId", "status");

ALTER TABLE "post_collaborators" ADD CONSTRAINT "post_collaborators_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_collaborators" ADD CONSTRAINT "post_collaborators_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
