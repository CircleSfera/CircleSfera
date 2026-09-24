-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'DELETING', 'DELETED');

-- AlterTable
ALTER TABLE "collections" ADD COLUMN     "mediaId" TEXT;

-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "mediaId" TEXT,
ADD COLUMN     "voiceMediaId" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "mediaId" TEXT,
ADD COLUMN     "voiceMediaId" TEXT;

-- AlterTable
ALTER TABLE "post_media" ADD COLUMN     "mediaId" TEXT;

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "avatarMediaId" TEXT,
ADD COLUMN     "coverMediaId" TEXT;

-- AlterTable
ALTER TABLE "stories" ADD COLUMN     "mediaId" TEXT;

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'READY',
    "url" TEXT NOT NULL,
    "standardUrl" TEXT,
    "thumbnailUrl" TEXT,
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_status_idx" ON "media"("status");

-- AddForeignKey
-- NOT VALID: skips the table scan / SHARE ROW EXCLUSIVE lock that would
-- otherwise block writes to each referencing table while every existing row
-- is checked. Every row's new FK column is NULL at this point anyway (just
-- added above), so there is nothing to validate yet. The immediately
-- following migration VALIDATEs all 9 constraints in separate, lighter-lock
-- transactions.
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_avatarMediaId_fkey" FOREIGN KEY ("avatarMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_voiceMediaId_fkey" FOREIGN KEY ("voiceMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_voiceMediaId_fkey" FOREIGN KEY ("voiceMediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
