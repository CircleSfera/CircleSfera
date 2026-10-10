-- Passkeys and their challenges belong to a sign-in. They keep "userId" for
-- what acts on the whole person. Additive: nothing existing is changed.

ALTER TABLE "passkeys" ADD COLUMN IF NOT EXISTS "signInId" TEXT;
ALTER TABLE "passkey_challenges" ADD COLUMN IF NOT EXISTS "signInId" TEXT;

CREATE INDEX IF NOT EXISTS "passkeys_signInId_idx" ON "passkeys"("signInId");
CREATE INDEX IF NOT EXISTS "passkey_challenges_signInId_idx" ON "passkey_challenges"("signInId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'passkeys_signInId_fkey') THEN
    ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_signInId_fkey"
      FOREIGN KEY ("signInId") REFERENCES "sign_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'passkey_challenges_signInId_fkey') THEN
    ALTER TABLE "passkey_challenges" ADD CONSTRAINT "passkey_challenges_signInId_fkey"
      FOREIGN KEY ("signInId") REFERENCES "sign_ins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Every existing row gets the first sign-in of its account, which is the only
-- one each account has.
UPDATE "passkeys" k
SET "signInId" = (
  SELECT s."id" FROM "sign_ins" s
  WHERE s."userId" = k."userId"
  ORDER BY s."createdAt", s."id"
  LIMIT 1
)
WHERE k."signInId" IS NULL;

UPDATE "passkey_challenges" c
SET "signInId" = (
  SELECT s."id" FROM "sign_ins" s
  WHERE s."userId" = c."userId"
  ORDER BY s."createdAt", s."id"
  LIMIT 1
)
WHERE c."signInId" IS NULL;

-- A new row that names no sign-in gets the first one of its account, so no
-- path leaves a passkey or a challenge without one.
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

DROP TRIGGER IF EXISTS "cs_passkey_default_sign_in" ON "passkeys";
CREATE TRIGGER "cs_passkey_default_sign_in"
BEFORE INSERT ON "passkeys"
FOR EACH ROW EXECUTE FUNCTION "cs_default_sign_in_of_account"();

DROP TRIGGER IF EXISTS "cs_passkey_challenge_default_sign_in" ON "passkey_challenges";
CREATE TRIGGER "cs_passkey_challenge_default_sign_in"
BEFORE INSERT ON "passkey_challenges"
FOR EACH ROW EXECUTE FUNCTION "cs_default_sign_in_of_account"();
