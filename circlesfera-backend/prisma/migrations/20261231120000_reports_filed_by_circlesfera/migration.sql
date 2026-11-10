-- A report CircleSfera files itself (automatic moderation, a moderation rule)
-- has no reporter. Until now such reports named the Profile of a member of
-- staff, which also counted that Profile as a reporter of the content.
ALTER TABLE "reports" ALTER COLUMN "reporterId" DROP NOT NULL;

UPDATE "reports"
SET "reporterId" = NULL
WHERE "details" LIKE '[AI Automated Flag]:%'
   OR "details" LIKE '[AI Vector Firewall]:%'
   OR "details" LIKE '[Moderation rule]:%';
