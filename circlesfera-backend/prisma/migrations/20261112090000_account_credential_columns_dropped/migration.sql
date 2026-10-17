-- The account's old copy of the credentials is dropped: they live on the
-- sign-in only (ADR-0025, step 8c). The previous version names none of
-- these columns, so a deploy that rolls back still works.

-- Stop, changing nothing, unless every account has a sign-in and every
-- account that still holds a password matches its first sign-in. A
-- mismatch would mean the copy holds something the sign-in does not.
DO $$
DECLARE
  without_sign_in INTEGER;
  differing INTEGER;
BEGIN
  SELECT count(*) INTO without_sign_in FROM "users" u
  WHERE NOT EXISTS (SELECT 1 FROM "sign_ins" s WHERE s."userId" = u."id");

  SELECT count(*) INTO differing FROM "users" u
  JOIN LATERAL (
    SELECT * FROM "sign_ins" s
    WHERE s."userId" = u."id"
    ORDER BY s."createdAt", s."id"
    LIMIT 1
  ) s ON TRUE
  WHERE u."password" IS NOT NULL AND (
    s."password" IS DISTINCT FROM u."password"
    OR s."emailVerified" IS DISTINCT FROM u."emailVerified"
    OR s."verificationToken" IS DISTINCT FROM u."verificationToken"
    OR s."resetToken" IS DISTINCT FROM u."resetToken"
    OR s."resetTokenExpires" IS DISTINCT FROM u."resetTokenExpires"
    OR s."passwordResetRequiredAt" IS DISTINCT FROM u."passwordResetRequiredAt"
    OR s."isTwoFactorEnabled" IS DISTINCT FROM u."isTwoFactorEnabled"
    OR s."twoFactorSecret" IS DISTINCT FROM u."twoFactorSecret"
  );

  IF without_sign_in > 0 OR differing > 0 THEN
    RAISE EXCEPTION
      'Accounts without a sign-in: %, accounts whose copy differs from their sign-in: %. Nothing was changed.',
      without_sign_in, differing;
  END IF;
END $$;

-- The copy between the account and its first sign-in, both ways.
DROP TRIGGER IF EXISTS "cs_sign_in_follow_user_insert" ON "users";
DROP TRIGGER IF EXISTS "cs_sign_in_follow_user_update" ON "users";
DROP TRIGGER IF EXISTS "cs_user_follow_first_sign_in" ON "sign_ins";
DROP FUNCTION IF EXISTS "cs_sign_in_follow_user"();
DROP FUNCTION IF EXISTS "cs_user_follow_first_sign_in"();

DROP INDEX IF EXISTS "users_verificationToken_key";
DROP INDEX IF EXISTS "users_resetToken_key";

-- @migration-safe: contract phase; the previous version names none of these columns
ALTER TABLE "users" DROP COLUMN "emailVerified";
-- @migration-safe: contract phase; the previous version names none of these columns
ALTER TABLE "users" DROP COLUMN "isTwoFactorEnabled";
-- @migration-safe: contract phase; the previous version names none of these columns
ALTER TABLE "users" DROP COLUMN "password";
-- @migration-safe: contract phase; the previous version names none of these columns
ALTER TABLE "users" DROP COLUMN "passwordResetRequiredAt";
-- @migration-safe: contract phase; the previous version names none of these columns
ALTER TABLE "users" DROP COLUMN "resetToken";
-- @migration-safe: contract phase; the previous version names none of these columns
ALTER TABLE "users" DROP COLUMN "resetTokenExpires";
-- @migration-safe: contract phase; the previous version names none of these columns
ALTER TABLE "users" DROP COLUMN "twoFactorSecret";
-- @migration-safe: contract phase; the previous version names none of these columns
ALTER TABLE "users" DROP COLUMN "verificationToken";
