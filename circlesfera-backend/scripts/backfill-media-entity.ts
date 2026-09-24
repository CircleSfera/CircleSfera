/**
 * One-off backfill: create a Media row for every existing non-null URL across
 * the 9 media slots (PostMedia, Story, Message media+voice, Comment
 * media+voice, Profile avatar+cover, Collection cover) and set that slot's
 * mediaId. Purely additive — never touches the existing inline url/
 * standardUrl/thumbnailUrl columns, which stay authoritative until every read
 * site is migrated onto the new relation.
 *
 * Idempotent: only processes rows where the relevant mediaId FK is still
 * null, so re-running after a partial/interrupted run is safe.
 *
 * Status inference (rows here always have an existing url — "pending" only
 * applies to an in-flight upload, which by definition cannot exist in a
 * historical backfill):
 *   - IMAGE / AUDIO slots: always READY (synchronous upload, no transcode).
 *   - VIDEO slots: READY if a standardUrl or thumbnailUrl variant exists,
 *     otherwise FAILED (transcode never completed — the one confirmed gap
 *     this item exists to make visible).
 *
 * Usage (from circlesfera-backend, with DATABASE_URL pointing at the target DB):
 *
 *   # Dry-run (default)
 *   npx tsx scripts/backfill-media-entity.ts
 *
 *   # Apply
 *   CONFIRM=YES npx tsx scripts/backfill-media-entity.ts
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { type MediaKind, type MediaStatus, PrismaClient } from '@prisma/client';
import pkg from 'pg';

const { Pool } = pkg;

const BATCH_SIZE = 200;

interface ResolvedRow {
  id: string;
  url: string;
  standardUrl: string | null;
  thumbnailUrl: string | null;
  kind: MediaKind;
  status: MediaStatus;
}

function videoStatus(
  standardUrl: string | null,
  thumbnailUrl: string | null,
): MediaStatus {
  return standardUrl || thumbnailUrl ? 'READY' : 'FAILED';
}

function isVideo(mediaType: string | null | undefined): boolean {
  return mediaType === 'video';
}

interface SlotResult {
  slot: string;
  scanned: number;
  created: number;
  ready: number;
  failed: number;
}

async function backfillSlot(
  slot: string,
  rows: ResolvedRow[],
  createMedia: (row: ResolvedRow) => Promise<{ id: string }>,
  setMediaId: (rowId: string, mediaId: string) => Promise<unknown>,
  confirm: boolean,
): Promise<SlotResult> {
  const result: SlotResult = {
    slot,
    scanned: rows.length,
    created: 0,
    ready: rows.filter((r) => r.status === 'READY').length,
    failed: rows.filter((r) => r.status === 'FAILED').length,
  };
  if (!confirm) return result;
  result.ready = 0;
  result.failed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (row) => {
        const media = await createMedia(row);
        await setMediaId(row.id, media.id);
        result.created += 1;
        if (row.status === 'READY') result.ready += 1;
        if (row.status === 'FAILED') result.failed += 1;
      }),
    );
  }
  return result;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }
  const confirm = process.env.CONFIRM === 'YES';

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const createMedia = (row: ResolvedRow) =>
    prisma.media.create({
      data: {
        kind: row.kind,
        status: row.status,
        url: row.url,
        standardUrl: row.standardUrl,
        thumbnailUrl: row.thumbnailUrl,
        failedAt: row.status === 'FAILED' ? new Date() : null,
      },
      select: { id: true },
    });

  try {
    const results: SlotResult[] = [];

    // PostMedia (image or video via `type`)
    {
      const rows = await prisma.postMedia.findMany({
        where: { mediaId: null },
        select: {
          id: true,
          url: true,
          standardUrl: true,
          thumbnailUrl: true,
          type: true,
        },
      });
      const resolved: ResolvedRow[] = rows.map((r) => {
        const kind: MediaKind = isVideo(r.type) ? 'VIDEO' : 'IMAGE';
        return {
          id: r.id,
          url: r.url,
          standardUrl: r.standardUrl,
          thumbnailUrl: r.thumbnailUrl,
          kind,
          status:
            kind === 'VIDEO'
              ? videoStatus(r.standardUrl, r.thumbnailUrl)
              : 'READY',
        };
      });
      results.push(
        await backfillSlot(
          'PostMedia',
          resolved,
          createMedia,
          (id, mediaId) =>
            prisma.postMedia.update({ where: { id }, data: { mediaId } }),
          confirm,
        ),
      );
    }

    // Story (image or video via `mediaType`)
    {
      const rows = await prisma.story.findMany({
        where: { mediaId: null },
        select: {
          id: true,
          url: true,
          standardUrl: true,
          thumbnailUrl: true,
          mediaType: true,
        },
      });
      const resolved: ResolvedRow[] = rows.map((r) => {
        const kind: MediaKind = isVideo(r.mediaType) ? 'VIDEO' : 'IMAGE';
        return {
          id: r.id,
          url: r.url,
          standardUrl: r.standardUrl,
          thumbnailUrl: r.thumbnailUrl,
          kind,
          status:
            kind === 'VIDEO'
              ? videoStatus(r.standardUrl, r.thumbnailUrl)
              : 'READY',
        };
      });
      results.push(
        await backfillSlot(
          'Story',
          resolved,
          createMedia,
          (id, mediaId) =>
            prisma.story.update({ where: { id }, data: { mediaId } }),
          confirm,
        ),
      );
    }

    // Message media (nullable url; image/video/file via `mediaType` — "file" and null default to IMAGE)
    {
      const rows = await prisma.message.findMany({
        where: { mediaId: null, url: { not: null } },
        select: {
          id: true,
          url: true,
          standardUrl: true,
          thumbnailUrl: true,
          mediaType: true,
        },
      });
      const resolved: ResolvedRow[] = rows.map((r) => {
        const kind: MediaKind = isVideo(r.mediaType) ? 'VIDEO' : 'IMAGE';
        return {
          id: r.id,
          url: r.url as string,
          standardUrl: r.standardUrl,
          thumbnailUrl: r.thumbnailUrl,
          kind,
          status:
            kind === 'VIDEO'
              ? videoStatus(r.standardUrl, r.thumbnailUrl)
              : 'READY',
        };
      });
      results.push(
        await backfillSlot(
          'Message.media',
          resolved,
          createMedia,
          (id, mediaId) =>
            prisma.message.update({ where: { id }, data: { mediaId } }),
          confirm,
        ),
      );
    }

    // Message voice notes (always audio, always ready)
    {
      const rows = await prisma.message.findMany({
        where: { voiceMediaId: null, voiceUrl: { not: null } },
        select: { id: true, voiceUrl: true },
      });
      const resolved: ResolvedRow[] = rows.map((r) => ({
        id: r.id,
        url: r.voiceUrl as string,
        standardUrl: null,
        thumbnailUrl: null,
        kind: 'AUDIO',
        status: 'READY',
      }));
      results.push(
        await backfillSlot(
          'Message.voice',
          resolved,
          createMedia,
          (id, mediaId) =>
            prisma.message.update({
              where: { id },
              data: { voiceMediaId: mediaId },
            }),
          confirm,
        ),
      );
    }

    // Comment media (nullable url; image/video/file via `mediaType`)
    {
      const rows = await prisma.comment.findMany({
        where: { mediaId: null, url: { not: null } },
        select: {
          id: true,
          url: true,
          standardUrl: true,
          thumbnailUrl: true,
          mediaType: true,
        },
      });
      const resolved: ResolvedRow[] = rows.map((r) => {
        const kind: MediaKind = isVideo(r.mediaType) ? 'VIDEO' : 'IMAGE';
        return {
          id: r.id,
          url: r.url as string,
          standardUrl: r.standardUrl,
          thumbnailUrl: r.thumbnailUrl,
          kind,
          status:
            kind === 'VIDEO'
              ? videoStatus(r.standardUrl, r.thumbnailUrl)
              : 'READY',
        };
      });
      results.push(
        await backfillSlot(
          'Comment.media',
          resolved,
          createMedia,
          (id, mediaId) =>
            prisma.comment.update({ where: { id }, data: { mediaId } }),
          confirm,
        ),
      );
    }

    // Comment voice notes (always audio, always ready)
    {
      const rows = await prisma.comment.findMany({
        where: { voiceMediaId: null, voiceUrl: { not: null } },
        select: { id: true, voiceUrl: true },
      });
      const resolved: ResolvedRow[] = rows.map((r) => ({
        id: r.id,
        url: r.voiceUrl as string,
        standardUrl: null,
        thumbnailUrl: null,
        kind: 'AUDIO',
        status: 'READY',
      }));
      results.push(
        await backfillSlot(
          'Comment.voice',
          resolved,
          createMedia,
          (id, mediaId) =>
            prisma.comment.update({
              where: { id },
              data: { voiceMediaId: mediaId },
            }),
          confirm,
        ),
      );
    }

    // Profile avatar (always image, always ready)
    {
      const rows = await prisma.profile.findMany({
        where: { avatarMediaId: null, avatar: { not: null } },
        select: {
          id: true,
          avatar: true,
          standardUrl: true,
          thumbnailUrl: true,
        },
      });
      const resolved: ResolvedRow[] = rows.map((r) => ({
        id: r.id,
        url: r.avatar as string,
        standardUrl: r.standardUrl,
        thumbnailUrl: r.thumbnailUrl,
        kind: 'IMAGE',
        status: 'READY',
      }));
      results.push(
        await backfillSlot(
          'Profile.avatar',
          resolved,
          createMedia,
          (id, mediaId) =>
            prisma.profile.update({
              where: { id },
              data: { avatarMediaId: mediaId },
            }),
          confirm,
        ),
      );
    }

    // Profile cover (always image, always ready)
    {
      const rows = await prisma.profile.findMany({
        where: { coverMediaId: null, cover: { not: null } },
        select: {
          id: true,
          cover: true,
          coverStandardUrl: true,
          coverThumbnailUrl: true,
        },
      });
      const resolved: ResolvedRow[] = rows.map((r) => ({
        id: r.id,
        url: r.cover as string,
        standardUrl: r.coverStandardUrl,
        thumbnailUrl: r.coverThumbnailUrl,
        kind: 'IMAGE',
        status: 'READY',
      }));
      results.push(
        await backfillSlot(
          'Profile.cover',
          resolved,
          createMedia,
          (id, mediaId) =>
            prisma.profile.update({
              where: { id },
              data: { coverMediaId: mediaId },
            }),
          confirm,
        ),
      );
    }

    // Collection cover (always image, always ready)
    {
      const rows = await prisma.collection.findMany({
        where: { mediaId: null, coverUrl: { not: null } },
        select: {
          id: true,
          coverUrl: true,
          standardUrl: true,
          thumbnailUrl: true,
        },
      });
      const resolved: ResolvedRow[] = rows.map((r) => ({
        id: r.id,
        url: r.coverUrl as string,
        standardUrl: r.standardUrl,
        thumbnailUrl: r.thumbnailUrl,
        kind: 'IMAGE',
        status: 'READY',
      }));
      results.push(
        await backfillSlot(
          'Collection.cover',
          resolved,
          createMedia,
          (id, mediaId) =>
            prisma.collection.update({ where: { id }, data: { mediaId } }),
          confirm,
        ),
      );
    }

    console.log(
      JSON.stringify(
        {
          database: connectionString.replace(/:[^:@/]+@/, ':***@'),
          mode: confirm ? 'APPLY' : 'dry-run',
          slots: results,
          totals: {
            scanned: results.reduce((sum, r) => sum + r.scanned, 0),
            created: results.reduce((sum, r) => sum + r.created, 0),
            ready: results.reduce((sum, r) => sum + r.ready, 0),
            failed: results.reduce((sum, r) => sum + r.failed, 0),
          },
        },
        null,
        2,
      ),
    );

    if (!confirm) {
      console.log(
        'Dry-run only. Re-run with CONFIRM=YES to create Media rows and set mediaId FKs.',
      );
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
