-- A host's live streams are erased with the host (TD-009). Until now the
-- foreign key refused the deletion, so the account of anyone who ever hosted
-- a live could not be erased. Only the constraint changes; no data moves.

-- DropForeignKey
ALTER TABLE "live_streams" DROP CONSTRAINT "live_streams_hostId_fkey";

-- AddForeignKey
ALTER TABLE "live_streams" ADD CONSTRAINT "live_streams_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
