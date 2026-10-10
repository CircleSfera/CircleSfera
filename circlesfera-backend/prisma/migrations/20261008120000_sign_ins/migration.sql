-- A sign-in holds the credentials one or more Profiles of a person are entered
-- with. The person stays on "users".
--
-- This step changes nothing anyone can see. Every account gets one sign-in with
-- a copy of its credentials, and every Profile points to it. Sign-in itself
-- still reads "users"; two triggers keep the copy equal while the readers are
-- moved, one change at a time:
--   - a write to the credential columns of a user is copied to its sign-in;
--   - a new Profile with no sign-in gets the one of its user.
-- Both triggers are removed when "users" stops holding credentials.

-- CreateTable
CREATE TABLE "sign_ins" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "verificationToken" TEXT,
    "resetToken" TEXT,
    "resetTokenExpires" TIMESTAMP(3),
    "passwordResetRequiredAt" TIMESTAMP(3),
    "isTwoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sign_ins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sign_ins_email_key" ON "sign_ins"("email");
CREATE UNIQUE INDEX "sign_ins_verificationToken_key" ON "sign_ins"("verificationToken");
CREATE UNIQUE INDEX "sign_ins_resetToken_key" ON "sign_ins"("resetToken");
CREATE INDEX "sign_ins_userId_idx" ON "sign_ins"("userId");

-- AddForeignKey
ALTER TABLE "sign_ins" ADD CONSTRAINT "sign_ins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN "signInId" TEXT;
CREATE INDEX "profiles_signInId_idx" ON "profiles"("signInId");
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_signInId_fkey" FOREIGN KEY ("signInId") REFERENCES "sign_ins"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- One sign-in per existing account, with its credentials as they are now.
INSERT INTO "sign_ins" (
    "id", "userId", "email", "password", "emailVerified", "verificationToken",
    "resetToken", "resetTokenExpires", "passwordResetRequiredAt",
    "isTwoFactorEnabled", "twoFactorSecret", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text, u."id", u."email", u."password", u."emailVerified",
    u."verificationToken", u."resetToken", u."resetTokenExpires",
    u."passwordResetRequiredAt", u."isTwoFactorEnabled", u."twoFactorSecret",
    u."createdAt", CURRENT_TIMESTAMP
FROM "users" u;

-- Every Profile enters with the sign-in of its account.
UPDATE "profiles" p
SET "signInId" = s."id"
FROM "sign_ins" s
WHERE s."userId" = p."userId";

-- Keep the sign-in of a user equal to the credential columns of that user.
-- While this trigger exists a user has exactly one sign-in; the oldest one is
-- taken so the rule stays defined if that ever stops being true.
CREATE FUNCTION "cs_sign_in_follow_user"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "sign_ins" SET
    "email" = NEW."email",
    "password" = NEW."password",
    "emailVerified" = NEW."emailVerified",
    "verificationToken" = NEW."verificationToken",
    "resetToken" = NEW."resetToken",
    "resetTokenExpires" = NEW."resetTokenExpires",
    "passwordResetRequiredAt" = NEW."passwordResetRequiredAt",
    "isTwoFactorEnabled" = NEW."isTwoFactorEnabled",
    "twoFactorSecret" = NEW."twoFactorSecret",
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = (
    SELECT "id" FROM "sign_ins"
    WHERE "userId" = NEW."id"
    ORDER BY "createdAt", "id"
    LIMIT 1
  );

  IF NOT FOUND THEN
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
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "cs_sign_in_follow_user_insert"
AFTER INSERT ON "users"
FOR EACH ROW EXECUTE FUNCTION "cs_sign_in_follow_user"();

CREATE TRIGGER "cs_sign_in_follow_user_update"
AFTER UPDATE OF
  "email", "password", "emailVerified", "verificationToken", "resetToken",
  "resetTokenExpires", "passwordResetRequiredAt", "isTwoFactorEnabled",
  "twoFactorSecret"
ON "users"
FOR EACH ROW EXECUTE FUNCTION "cs_sign_in_follow_user"();

-- A Profile created without a sign-in enters with the one of its account.
CREATE FUNCTION "cs_profile_default_sign_in"() RETURNS trigger
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

CREATE TRIGGER "cs_profile_default_sign_in"
BEFORE INSERT ON "profiles"
FOR EACH ROW EXECUTE FUNCTION "cs_profile_default_sign_in"();
