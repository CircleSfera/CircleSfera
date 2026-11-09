-- Validates the foreign key added NOT VALID in the previous migration; it
-- takes only SHARE UPDATE EXCLUSIVE, so writes to "notifications" go on.
ALTER TABLE "notifications" VALIDATE CONSTRAINT "notifications_previousSenderId_fkey";
