-- The people who work on a Business Profile besides its owner, with a role
-- (ADR-0028). Nothing uses them yet.
-- CreateEnum
CREATE TYPE "ProfileMemberRole" AS ENUM ('ADMINISTRATOR', 'EDITOR');

-- CreateEnum
CREATE TYPE "ProfileMemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'PAUSED', 'DECLINED', 'REMOVED');

-- CreateTable
CREATE TABLE "profile_members" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProfileMemberRole" NOT NULL,
    "status" "ProfileMemberStatus" NOT NULL DEFAULT 'INVITED',
    "invitedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profile_members_userId_status_idx" ON "profile_members"("userId", "status");

-- CreateIndex
CREATE INDEX "profile_members_profileId_status_idx" ON "profile_members"("profileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "profile_members_profileId_userId_key" ON "profile_members"("profileId", "userId");

-- AddForeignKey
ALTER TABLE "profile_members" ADD CONSTRAINT "profile_members_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_members" ADD CONSTRAINT "profile_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_members" ADD CONSTRAINT "profile_members_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

