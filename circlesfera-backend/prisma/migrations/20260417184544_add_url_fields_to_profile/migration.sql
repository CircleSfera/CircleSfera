-- AlterTable
ALTER TABLE "collections" ADD COLUMN     "standardUrl" TEXT,
ADD COLUMN     "thumbnailUrl" TEXT;

-- AlterTable
ALTER TABLE "post_media" ADD COLUMN     "standardUrl" TEXT,
ADD COLUMN     "thumbnailUrl" TEXT;

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "standardUrl" TEXT,
ADD COLUMN     "thumbnailUrl" TEXT;

-- AlterTable
ALTER TABLE "stories" ADD COLUMN     "standardUrl" TEXT,
ADD COLUMN     "thumbnailUrl" TEXT;
