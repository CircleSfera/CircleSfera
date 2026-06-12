-- AlterTable
ALTER TABLE "post_media" ADD COLUMN     "altText" TEXT;

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "hideLikes" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "turnOffComments" BOOLEAN NOT NULL DEFAULT false;
