-- A live has its guests as rows of their own, up to a few at once, in place
-- of one co-host held on the live. The old column live_streams.coHostId is
-- kept and no longer written; it is dropped in a later release.

CREATE TYPE "LiveGuestStatus" AS ENUM ('INVITED', 'ON_AIR', 'DECLINED', 'LEFT', 'REMOVED');

CREATE TABLE "live_guests" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "status" "LiveGuestStatus" NOT NULL DEFAULT 'INVITED',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "live_guests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "live_guests_profileId_idx" ON "live_guests"("profileId");

CREATE UNIQUE INDEX "live_guests_streamId_profileId_key" ON "live_guests"("streamId", "profileId");

ALTER TABLE "live_guests" ADD CONSTRAINT "live_guests_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "live_streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "live_guests" ADD CONSTRAINT "live_guests_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A recording part names the guest it records; the host's names nobody.
ALTER TABLE "live_recording_parts" ADD COLUMN "profileId" TEXT;

CREATE INDEX "live_recording_parts_profileId_idx" ON "live_recording_parts"("profileId");

-- Every co-host a live still names becomes its guest: on air while the live
-- is on, gone once it ended. The old co-host was named as soon as invited, so
-- on a live still on they count as on air, as the old apps showed them.
INSERT INTO "live_guests" ("id", "streamId", "profileId", "status", "invitedAt", "joinedAt", "endedAt")
SELECT
    gen_random_uuid()::text,
    s."id",
    s."coHostId",
    CASE WHEN s."status" = 'LIVE' THEN 'ON_AIR'::"LiveGuestStatus" ELSE 'LEFT'::"LiveGuestStatus" END,
    s."startedAt",
    s."startedAt",
    CASE WHEN s."status" = 'LIVE' THEN NULL ELSE COALESCE(s."endedAt", s."startedAt") END
FROM "live_streams" s
WHERE s."coHostId" IS NOT NULL;

-- Only a co-host part still being recorded on a live still on is named after
-- the co-host the live names: an invite of another co-host stopped the part
-- of the one before, so the part recording now is the current co-host's, and
-- naming it lets that guest's leaving stop it. Every other co-host part stays
-- with nobody named: a new invite overwrote the live's co-host, so an older
-- part may be someone else's. The replay shows the parts of nobody named as
-- one guest, as the old co-hosts were never on air together.
UPDATE "live_recording_parts" p
SET "profileId" = s."coHostId"
FROM "live_streams" s
WHERE p."streamId" = s."id"
  AND p."role" = 'COHOST'
  AND p."status" = 'RECORDING'
  AND p."profileId" IS NULL
  AND s."status" = 'LIVE'
  AND s."coHostId" IS NOT NULL;
