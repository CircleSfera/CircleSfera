-- Every member of staff must use the second factor, with no switch to turn
-- it off. The previous version neither reads nor writes this column, so a
-- deploy that rolls back still works.
-- @migration-safe: contract phase; the previous version names no such column
ALTER TABLE "admin_identities" DROP COLUMN "mfaRequired";
