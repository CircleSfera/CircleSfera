-- A broadcast's recording jobs are kept per part (live_recording_parts). The
-- previous version neither reads nor writes this column, so a deploy that
-- rolls back still works. Dropping the column drops its unique index.
-- @migration-safe: contract phase; the previous version names no such column
ALTER TABLE "live_streams" DROP COLUMN "egressId";
