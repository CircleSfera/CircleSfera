/*
  Warnings:

  - You are about to drop the column `mediaUrl` on the `comments` table. All the data in the column will be lost.
  - You are about to drop the column `mediaUrl` on the `messages` table. All the data in the column will be lost.
  - You are about to drop the column `mediaUrl` on the `stories` table. All the data in the column will be lost.
  - Added the required column `url` to the `stories` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "comments" DROP COLUMN "mediaUrl",
ADD COLUMN     "url" TEXT;

-- AlterTable
ALTER TABLE "messages" DROP COLUMN "mediaUrl",
ADD COLUMN     "url" TEXT;

-- AlterTable
ALTER TABLE "stories" DROP COLUMN "mediaUrl",
ADD COLUMN     "url" TEXT NOT NULL;
