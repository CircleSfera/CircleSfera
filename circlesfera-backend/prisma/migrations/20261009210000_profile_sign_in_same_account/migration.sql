-- A Profile signs in only with a sign-in of its own account. The server
-- checks it; the database keeps it, whatever code writes the row. Function
-- and trigger only: no table or column changes.

CREATE OR REPLACE FUNCTION "cs_profile_sign_in_same_account"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."signInId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "sign_ins"
    WHERE "id" = NEW."signInId" AND "userId" = NEW."userId"
  ) THEN
    RAISE EXCEPTION 'A Profile can only use a sign-in of its own account'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "cs_profile_sign_in_same_account" ON "profiles";
CREATE TRIGGER "cs_profile_sign_in_same_account"
BEFORE INSERT OR UPDATE OF "signInId", "userId" ON "profiles"
FOR EACH ROW EXECUTE FUNCTION "cs_profile_sign_in_same_account"();
