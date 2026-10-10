-- A stored refresh token belongs to the sign-in that opened its session. It
-- keeps "userId" for what acts on the whole person. Additive: nothing
-- existing is changed.

ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "signInId" TEXT;

CREATE INDEX IF NOT EXISTS "refresh_tokens_signInId_idx" ON "refresh_tokens"("signInId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refresh_tokens_signInId_fkey') THEN
    ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_signInId_fkey"
      FOREIGN KEY ("signInId") REFERENCES "sign_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Every session already open was opened by the first sign-in of its account,
-- which is the only one each account has.
UPDATE "refresh_tokens" t
SET "signInId" = (
  SELECT s."id" FROM "sign_ins" s
  WHERE s."userId" = t."userId"
  ORDER BY s."createdAt", s."id"
  LIMIT 1
)
WHERE t."signInId" IS NULL;

-- A new row that names no sign-in gets the first one of its account.
CREATE OR REPLACE FUNCTION "cs_default_sign_in_of_account"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."signInId" IS NULL THEN
    SELECT "id" INTO NEW."signInId" FROM "sign_ins"
    WHERE "userId" = NEW."userId"
    ORDER BY "createdAt", "id"
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "cs_refresh_token_default_sign_in" ON "refresh_tokens";
CREATE TRIGGER "cs_refresh_token_default_sign_in"
BEFORE INSERT ON "refresh_tokens"
FOR EACH ROW EXECUTE FUNCTION "cs_default_sign_in_of_account"();
