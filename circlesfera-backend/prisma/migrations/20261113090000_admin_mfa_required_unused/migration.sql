-- Every member of staff must use the second factor, so mfaRequired is no
-- longer read or written. It loses its default, so the client never writes
-- it, and a later change can drop it while this version still works if a
-- deploy rolls back to it.
ALTER TABLE "admin_identities" ALTER COLUMN "mfaRequired" DROP NOT NULL,
ALTER COLUMN "mfaRequired" DROP DEFAULT;
