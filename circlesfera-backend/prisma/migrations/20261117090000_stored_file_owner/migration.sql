-- Who owns a stored file: one row per file this server stores, with the
-- Profile it belongs to. Added, then filled for the files already in use.

-- CreateTable
CREATE TABLE "stored_files" (
    "key" TEXT NOT NULL,
    "profileId" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "stored_files_profileId_idx" ON "stored_files"("profileId");

-- CreateIndex
CREATE INDEX "stored_files_uploadedById_idx" ON "stored_files"("uploadedById");

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Files already stored. Only this server's own uploads are recorded, by the
-- pattern the storage itself answers (/uploads/<uuid>.<ext>; a video's stream
-- folder belongs to its source). The shared media rows are read too: they
-- still name the original file of a message or comment whose row lost it.
-- A file belongs to the Profile of the rows that use it; when several
-- Profiles use it, or a row has no Profile (a group photo, the audio
-- library), it has no owner and no person's action will delete it.
WITH refs ("key", "profileId") AS (
    SELECT v."key", p."profileId"
    FROM "post_media" pm
    JOIN "posts" p ON p."id" = pm."postId"
    CROSS JOIN LATERAL (VALUES (pm."url"), (pm."standardUrl"), (pm."thumbnailUrl")) v("key")
  UNION ALL
    SELECT v."key", s."profileId"
    FROM "stories" s
    CROSS JOIN LATERAL (VALUES (s."url"), (s."standardUrl"), (s."thumbnailUrl"), (s."overlayUrl")) v("key")
  UNION ALL
    SELECT v."key", m."senderId"
    FROM "messages" m
    CROSS JOIN LATERAL (VALUES (m."url"), (m."standardUrl"), (m."thumbnailUrl"), (m."voiceUrl")) v("key")
  UNION ALL
    SELECT v."key", c."profileId"
    FROM "comments" c
    CROSS JOIN LATERAL (VALUES (c."url"), (c."standardUrl"), (c."thumbnailUrl"), (c."voiceUrl")) v("key")
  UNION ALL
    SELECT v."key", pr."id"
    FROM "profiles" pr
    CROSS JOIN LATERAL (VALUES (pr."avatar"), (pr."standardUrl"), (pr."thumbnailUrl"), (pr."cover"), (pr."coverStandardUrl"), (pr."coverThumbnailUrl")) v("key")
  UNION ALL
    SELECT h."coverUrl", h."profileId" FROM "highlights" h
  UNION ALL
    SELECT v."key", co."profileId"
    FROM "collections" co
    CROSS JOIN LATERAL (VALUES (co."coverUrl"), (co."standardUrl"), (co."thumbnailUrl")) v("key")
  UNION ALL
    SELECT e."mediaUrl", e."profileId" FROM "edit_projects" e
  UNION ALL
    SELECT clip."key", e."profileId"
    FROM "edit_projects" e
    CROSS JOIN LATERAL jsonb_path_query(e."state"::jsonb, 'lax $.studio.tracks[*].clips[*].fileUrl') AS clip_json
    CROSS JOIN LATERAL (SELECT clip_json #>> '{}') clip("key")
  UNION ALL
    SELECT v."key", own."profileId"
    FROM (
        SELECT pm."mediaId" AS "mediaId", p."profileId" FROM "post_media" pm JOIN "posts" p ON p."id" = pm."postId"
        UNION ALL SELECT s."mediaId", s."profileId" FROM "stories" s
        UNION ALL SELECT m."mediaId", m."senderId" FROM "messages" m
        UNION ALL SELECT m."voiceMediaId", m."senderId" FROM "messages" m
        UNION ALL SELECT c."mediaId", c."profileId" FROM "comments" c
        UNION ALL SELECT c."voiceMediaId", c."profileId" FROM "comments" c
        UNION ALL SELECT pr."avatarMediaId", pr."id" FROM "profiles" pr
        UNION ALL SELECT pr."coverMediaId", pr."id" FROM "profiles" pr
        UNION ALL SELECT co."mediaId", co."profileId" FROM "collections" co
    ) own
    JOIN "media" md ON md."id" = own."mediaId"
    CROSS JOIN LATERAL (VALUES (md."url"), (md."standardUrl"), (md."thumbnailUrl")) v("key")
  UNION ALL
    SELECT cv."avatarUrl", NULL FROM "conversations" cv
  UNION ALL
    SELECT v."key", NULL
    FROM "audio_tracks" a
    CROSS JOIN LATERAL (VALUES (a."url"), (a."thumbnailUrl")) v("key")
)
INSERT INTO "stored_files" ("key", "profileId")
SELECT
    r."key",
    CASE
        WHEN COUNT(*) = COUNT(r."profileId") AND COUNT(DISTINCT r."profileId") = 1
            THEN MIN(r."profileId")
    END
FROM refs r
WHERE r."key" ~* '^/uploads/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$'
GROUP BY r."key"
ON CONFLICT ("key") DO NOTHING;
