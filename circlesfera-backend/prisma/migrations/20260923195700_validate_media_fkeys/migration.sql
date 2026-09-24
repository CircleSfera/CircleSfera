-- Validates the 9 NOT VALID foreign keys added in the previous migration, in
-- a transaction of their own. VALIDATE CONSTRAINT still scans the table, but
-- takes only a SHARE UPDATE EXCLUSIVE lock, which does not block concurrent
-- reads or writes the way the ADD CONSTRAINT scan does.
ALTER TABLE "profiles" VALIDATE CONSTRAINT "profiles_avatarMediaId_fkey";
ALTER TABLE "profiles" VALIDATE CONSTRAINT "profiles_coverMediaId_fkey";
ALTER TABLE "post_media" VALIDATE CONSTRAINT "post_media_mediaId_fkey";
ALTER TABLE "stories" VALIDATE CONSTRAINT "stories_mediaId_fkey";
ALTER TABLE "comments" VALIDATE CONSTRAINT "comments_mediaId_fkey";
ALTER TABLE "comments" VALIDATE CONSTRAINT "comments_voiceMediaId_fkey";
ALTER TABLE "collections" VALIDATE CONSTRAINT "collections_mediaId_fkey";
ALTER TABLE "messages" VALIDATE CONSTRAINT "messages_mediaId_fkey";
ALTER TABLE "messages" VALIDATE CONSTRAINT "messages_voiceMediaId_fkey";
