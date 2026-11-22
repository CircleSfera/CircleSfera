-- The staff audit action of the paid content review, part of the creator
-- monetization that was removed: nothing writes it. Its entries are deleted
-- and the value leaves the type, as the owner decided.
-- @migration-safe: no code reads or writes this action; the previous image
-- never names it, and the rows that carried it are deleted first.

DELETE FROM "admin_audit_logs"
WHERE "action"::text = 'PAID_CONTENT_APPROVED';

-- A value cannot leave a PostgreSQL enum: the type is made again from the
-- values it has now, without this one, so any value another release added is
-- kept whatever the order of deploys.
DO $$
DECLARE
  kept TEXT;
BEGIN
  SELECT string_agg(quote_literal(enumlabel), ', ' ORDER BY enumsortorder)
  INTO kept
  FROM pg_enum
  WHERE enumtypid = '"AdminAction"'::regtype
    AND enumlabel <> 'PAID_CONTENT_APPROVED';

  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = '"AdminAction"'::regtype
      AND enumlabel = 'PAID_CONTENT_APPROVED'
  ) THEN
    EXECUTE 'ALTER TYPE "AdminAction" RENAME TO "AdminAction_old"';
    EXECUTE 'CREATE TYPE "AdminAction" AS ENUM (' || kept || ')';
    EXECUTE 'ALTER TABLE "admin_audit_logs" ALTER COLUMN "action" TYPE "AdminAction" USING "action"::text::"AdminAction"';
    EXECUTE 'DROP TYPE "AdminAction_old"';
  END IF;
END $$;
