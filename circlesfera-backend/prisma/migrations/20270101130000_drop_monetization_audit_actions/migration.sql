-- The three staff audit actions of the creator monetization programme,
-- which was removed: nothing writes them. Their entries are deleted and the
-- values leave the type, as the owner decided.
-- @migration-safe: no code reads or writes these actions; the previous
-- image never names them, and the rows that carried them are deleted first.

DELETE FROM "admin_audit_logs"
WHERE "action"::text IN ('MONETIZATION_APPROVED', 'MONETIZATION_REJECTED', 'MONETIZATION_REVOKED');

-- A value cannot leave a PostgreSQL enum: the type is made again from the
-- values it has now, without the three, so any value another release added
-- is kept whatever the order of deploys.
DO $$
DECLARE
  kept TEXT;
BEGIN
  SELECT string_agg(quote_literal(enumlabel), ', ' ORDER BY enumsortorder)
  INTO kept
  FROM pg_enum
  WHERE enumtypid = '"AdminAction"'::regtype
    AND enumlabel NOT IN ('MONETIZATION_APPROVED', 'MONETIZATION_REJECTED', 'MONETIZATION_REVOKED');

  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = '"AdminAction"'::regtype
      AND enumlabel IN ('MONETIZATION_APPROVED', 'MONETIZATION_REJECTED', 'MONETIZATION_REVOKED')
  ) THEN
    EXECUTE 'ALTER TYPE "AdminAction" RENAME TO "AdminAction_old"';
    EXECUTE 'CREATE TYPE "AdminAction" AS ENUM (' || kept || ')';
    EXECUTE 'ALTER TABLE "admin_audit_logs" ALTER COLUMN "action" TYPE "AdminAction" USING "action"::text::"AdminAction"';
    EXECUTE 'DROP TYPE "AdminAction_old"';
  END IF;
END $$;
