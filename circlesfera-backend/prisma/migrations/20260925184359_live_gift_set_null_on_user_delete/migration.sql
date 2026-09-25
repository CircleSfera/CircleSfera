-- DropForeignKey
ALTER TABLE "live_gifts" DROP CONSTRAINT IF EXISTS "live_gifts_receiverId_fkey";

-- DropForeignKey
ALTER TABLE "live_gifts" DROP CONSTRAINT IF EXISTS "live_gifts_senderId_fkey";

-- AlterTable
ALTER TABLE "live_gifts" ALTER COLUMN "senderId" DROP NOT NULL,
ALTER COLUMN "receiverId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "live_gifts" ADD CONSTRAINT "live_gifts_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_gifts" ADD CONSTRAINT "live_gifts_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
