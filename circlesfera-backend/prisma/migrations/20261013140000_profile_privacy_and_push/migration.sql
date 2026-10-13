-- Whether an account is private, and its push notifications, are chosen for
-- each Profile: a person may keep one Profile public and another private.
-- Every existing Profile starts with the choice its person had, so nobody
-- changes state when this runs. The two columns of user_settings stay,
-- unread, as they were.
ALTER TABLE "profiles" ADD COLUMN "privacyLevel" "Visibility" NOT NULL DEFAULT 'PUBLIC';
ALTER TABLE "profiles" ADD COLUMN "pushNotifications" BOOLEAN NOT NULL DEFAULT true;

UPDATE "profiles" p
SET "privacyLevel" = s."privacyLevel",
    "pushNotifications" = s."pushNotifications"
FROM "user_settings" s
WHERE s."userId" = p."userId";

-- The lists of public content filter on it.
CREATE INDEX "profiles_privacyLevel_idx" ON "profiles"("privacyLevel");
