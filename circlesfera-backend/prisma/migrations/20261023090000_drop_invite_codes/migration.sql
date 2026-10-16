-- CircleSfera has no invite codes or referrals. This deletes each account's
-- invite code and the record of who invited whom, and the setting that
-- required a code to register. It cannot be undone except from a backup.
ALTER TABLE "users" DROP CONSTRAINT "users_referredById_fkey";

DROP INDEX "users_inviteCode_key";

ALTER TABLE "users" DROP COLUMN "inviteCode",
DROP COLUMN "referredById";

DELETE FROM "system_settings" WHERE "key" = 'require_invite_code';
