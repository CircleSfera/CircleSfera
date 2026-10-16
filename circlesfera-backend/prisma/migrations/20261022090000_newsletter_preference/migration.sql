-- The newsletter gets a preference of its own, apart from the email notices.
-- It is on by default; whoever had switched email notices off, which used to
-- keep them out of the newsletter too, stays out.
ALTER TABLE "user_settings" ADD COLUMN "newsletter" BOOLEAN NOT NULL DEFAULT true;

UPDATE "user_settings" SET "newsletter" = false WHERE "emailNotifications" = false;
