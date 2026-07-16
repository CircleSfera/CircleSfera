/*
  Warnings:

  - You are about to drop the column `e2eKeys` on the `messages` table. All the data in the column will be lost.
  - You are about to drop the column `e2ePrivateKeyEncrypted` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `e2ePublicKey` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "messages" DROP COLUMN "e2eKeys";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "e2ePrivateKeyEncrypted",
DROP COLUMN "e2ePublicKey",
ADD COLUMN     "strikeCount" INTEGER NOT NULL DEFAULT 0;
