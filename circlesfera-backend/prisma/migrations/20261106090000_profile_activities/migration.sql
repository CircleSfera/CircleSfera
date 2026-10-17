-- What was done on a Business Profile and which person did it (ADR-0028).
-- CreateEnum
CREATE TYPE "ProfileActivityAction" AS ENUM ('POST_PUBLISHED', 'POST_EDITED', 'POST_DELETED', 'STORY_PUBLISHED', 'STORY_DELETED', 'COMMENT_WRITTEN', 'COMMENT_EDITED', 'COMMENT_DELETED');

-- CreateTable
CREATE TABLE "profile_activities" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "userId" TEXT,
    "action" "ProfileActivityAction" NOT NULL,
    "targetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profile_activities_profileId_createdAt_idx" ON "profile_activities"("profileId", "createdAt");

-- AddForeignKey
ALTER TABLE "profile_activities" ADD CONSTRAINT "profile_activities_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_activities" ADD CONSTRAINT "profile_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

