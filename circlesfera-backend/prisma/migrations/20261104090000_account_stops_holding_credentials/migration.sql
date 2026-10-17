-- The account stops holding the credentials: the app writes them on the
-- sign-in only. The account's old copy is kept, and kept equal, until a later
-- change removes it, so an older version of the app still running during a
-- deploy keeps working.

-- An account created by the app now has no password of its own.
ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;

CREATE OR REPLACE FUNCTION "cs_sign_in_follow_user"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  first_sign_in TEXT;
BEGIN
  -- The app writes the credentials on the sign-in and leaves the account
  -- without them. Only an older version of the app, still running while a
  -- deploy rolls out, writes them on the account: then they still reach the
  -- sign-in, as before.
  IF NEW."password" IS NULL THEN
    RETURN NEW;
  END IF;

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

-- The copy the other way, from the first sign-in to the account, is kept only
-- for accounts that still hold one.
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

  -- An account that holds no credentials of its own (created by this
  -- version of the app) is not given a copy.
  IF EXISTS (
    SELECT 1 FROM "users" WHERE "id" = NEW."userId" AND "password" IS NULL
  ) THEN
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
