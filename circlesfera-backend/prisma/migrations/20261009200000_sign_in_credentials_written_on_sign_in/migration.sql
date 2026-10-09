-- Credentials are now written on the sign-in. The account keeps a copy of
-- those of its first sign-in until its credential columns are removed, so
-- what still reads the account stays right. Functions and triggers only: no
-- table or column changes.

-- A write on the account still reaches its first sign-in, for any writer
-- left behind. It acts only when a value differs, so the two copies settle
-- instead of answering each other.
CREATE OR REPLACE FUNCTION "cs_sign_in_follow_user"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  first_sign_in TEXT;
BEGIN
  SELECT "id" INTO first_sign_in FROM "sign_ins"
  WHERE "userId" = NEW."id"
  ORDER BY "createdAt", "id"
  LIMIT 1;

  IF first_sign_in IS NULL THEN
    INSERT INTO "sign_ins" (
      "id", "userId", "email", "password", "emailVerified", "verificationToken",
      "resetToken", "resetTokenExpires", "passwordResetRequiredAt",
      "isTwoFactorEnabled", "twoFactorSecret", "createdAt", "updatedAt"
    ) VALUES (
      gen_random_uuid()::text, NEW."id", NEW."email", NEW."password",
      NEW."emailVerified", NEW."verificationToken", NEW."resetToken",
      NEW."resetTokenExpires", NEW."passwordResetRequiredAt",
      NEW."isTwoFactorEnabled", NEW."twoFactorSecret", NEW."createdAt",
      CURRENT_TIMESTAMP
    );
    RETURN NEW;
  END IF;

  -- Written as one row against one row: the nine columns travel together.
  UPDATE "sign_ins" SET (
    "email",
    "password",
    "emailVerified",
    "verificationToken",
    "resetToken",
    "resetTokenExpires",
    "passwordResetRequiredAt",
    "isTwoFactorEnabled",
    "twoFactorSecret"
  ) = ROW(
    NEW."email",
    NEW."password",
    NEW."emailVerified",
    NEW."verificationToken",
    NEW."resetToken",
    NEW."resetTokenExpires",
    NEW."passwordResetRequiredAt",
    NEW."isTwoFactorEnabled",
    NEW."twoFactorSecret"
  ),
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = first_sign_in
    AND (
    "email",
    "password",
    "emailVerified",
    "verificationToken",
    "resetToken",
    "resetTokenExpires",
    "passwordResetRequiredAt",
    "isTwoFactorEnabled",
    "twoFactorSecret"
  ) IS DISTINCT FROM (
    NEW."email",
    NEW."password",
    NEW."emailVerified",
    NEW."verificationToken",
    NEW."resetToken",
    NEW."resetTokenExpires",
    NEW."passwordResetRequiredAt",
    NEW."isTwoFactorEnabled",
    NEW."twoFactorSecret"
  );

  RETURN NEW;
END;
$$;

-- A write on a sign-in reaches its account when that sign-in is the first of
-- the account. A write on any other sign-in stays on that sign-in.
CREATE OR REPLACE FUNCTION "cs_user_follow_first_sign_in"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  first_sign_in TEXT;
BEGIN
  SELECT "id" INTO first_sign_in FROM "sign_ins"
  WHERE "userId" = NEW."userId"
  ORDER BY "createdAt", "id"
  LIMIT 1;

  IF NEW."id" IS DISTINCT FROM first_sign_in THEN
    RETURN NEW;
  END IF;

  UPDATE "users" SET (
    "email",
    "password",
    "emailVerified",
    "verificationToken",
    "resetToken",
    "resetTokenExpires",
    "passwordResetRequiredAt",
    "isTwoFactorEnabled",
    "twoFactorSecret"
  ) = ROW(
    NEW."email",
    NEW."password",
    NEW."emailVerified",
    NEW."verificationToken",
    NEW."resetToken",
    NEW."resetTokenExpires",
    NEW."passwordResetRequiredAt",
    NEW."isTwoFactorEnabled",
    NEW."twoFactorSecret"
  )
  WHERE "id" = NEW."userId"
    AND (
    "email",
    "password",
    "emailVerified",
    "verificationToken",
    "resetToken",
    "resetTokenExpires",
    "passwordResetRequiredAt",
    "isTwoFactorEnabled",
    "twoFactorSecret"
  ) IS DISTINCT FROM (
    NEW."email",
    NEW."password",
    NEW."emailVerified",
    NEW."verificationToken",
    NEW."resetToken",
    NEW."resetTokenExpires",
    NEW."passwordResetRequiredAt",
    NEW."isTwoFactorEnabled",
    NEW."twoFactorSecret"
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "cs_user_follow_first_sign_in" ON "sign_ins";
CREATE TRIGGER "cs_user_follow_first_sign_in"
AFTER UPDATE OF
  "email", "password", "emailVerified", "verificationToken", "resetToken",
  "resetTokenExpires", "passwordResetRequiredAt", "isTwoFactorEnabled",
  "twoFactorSecret"
ON "sign_ins"
FOR EACH ROW EXECUTE FUNCTION "cs_user_follow_first_sign_in"();
