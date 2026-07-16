-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "standardUrl" TEXT,
ADD COLUMN     "thumbnailUrl" TEXT;

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "standardUrl" TEXT,
ADD COLUMN     "thumbnailUrl" TEXT;
