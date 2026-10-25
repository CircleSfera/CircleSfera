-- A host's live streams are erased with the host (TD-009). Until now the
-- foreign key refused the deletion, so the account of anyone who ever hosted
-- a live could not be erased. The gifts sent during those streams are
-- financial records kept for seven years whoever is erased: they lose their
-- stream instead of going with it. No data moves.

-- DropForeignKey
ALTER TABLE "live_streams" DROP CONSTRAINT "live_streams_hostId_fkey";

-- DropForeignKey
ALTER TABLE "live_gifts" DROP CONSTRAINT "live_gifts_streamId_fkey";

-- AlterTable
ALTER TABLE "live_gifts" ALTER COLUMN "streamId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "live_streams" ADD CONSTRAINT "live_streams_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_gifts" ADD CONSTRAINT "live_gifts_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "live_streams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
