-- A file that a content deletion left on the disk with no row using it is
-- marked, so that media access serves it only to its owner until the sweep
-- deletes it (TD-008). Only added; no data changes.

-- AlterTable
ALTER TABLE "stored_files" ADD COLUMN "detachedAt" TIMESTAMP(3);
