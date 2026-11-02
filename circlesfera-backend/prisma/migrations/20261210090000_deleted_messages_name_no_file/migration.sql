-- Messages deleted before a deleted message stopped naming its files still
-- hold the addresses of their photo, video or voice note, so the files stay
-- in use and are never erased. They now name no file, as a message deleted
-- today does: the links to their Media rows go too. The nightly sweep then
-- erases each file no other row names.
UPDATE "messages"
SET "url" = NULL,
    "standardUrl" = NULL,
    "thumbnailUrl" = NULL,
    "mediaType" = NULL,
    "mediaId" = NULL,
    "voiceUrl" = NULL,
    "voiceDuration" = NULL,
    "voiceWaveform" = NULL,
    "voiceMediaId" = NULL
WHERE "isDeleted" = true
  AND (
    "url" IS NOT NULL
    OR "standardUrl" IS NOT NULL
    OR "thumbnailUrl" IS NOT NULL
    OR "mediaType" IS NOT NULL
    OR "mediaId" IS NOT NULL
    OR "voiceUrl" IS NOT NULL
    OR "voiceDuration" IS NOT NULL
    OR "voiceWaveform" IS NOT NULL
    OR "voiceMediaId" IS NOT NULL
  );
