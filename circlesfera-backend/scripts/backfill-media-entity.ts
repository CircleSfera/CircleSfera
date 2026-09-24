/**
 * One-off backfill: create a Media row for every existing non-null URL across
 * the 9 media slots (PostMedia, Story, Message media+voice, Comment
 * media+voice, Profile avatar+cover, Collection cover) and set that slot's
 * mediaId. Purely additive — never touches the existing inline url/
 * standardUrl/thumbnailUrl columns, which stay authoritative until every read
 * site is migrated onto the new relation.
 *
 * Idempotent: only processes rows where the relevant mediaId FK is still
 * null, so re-running after a partial/interrupted run is safe. Each row's
 * Media row is created and linked in a single atomic nested write (not a
 * separate create + update), so a crash or rejection mid-run can never leave
 * an orphaned Media row with no owner — the two either both happen or
 * neither does.
 *
 * Runs against a live database with uploads still in flight, so a video row
 * with no variant yet isn't necessarily a failed transcode — it may just
 * still be queued or retrying. Only a video row older than
 * PENDING_WINDOW_MS with no variant is reported FAILED; a younger one is
 * PENDING, and a later run of this same script (or, once one exists, a
 * dedicated reconciliation job) will pick it up once the transcode
 * completes and video.processor.ts sets its variant columns.
 *
 * Reads each slot in pages of BATCH_SIZE (cursor by id), so the script never
 * holds an unbounded result set in memory regardless of table size.
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
const PENDING_WINDOW_MS = 24 * 60 * 60 * 1000;

interface MediaCreateData {
  kind: MediaKind;
  status: MediaStatus;
  url: string;
  standardUrl: string | null;
  thumbnailUrl: string | null;
  failedAt: Date | null;
}

interface ResolvedRow extends MediaCreateData {
  id: string;
}

function videoStatus(
  standardUrl: string | null,
  thumbnailUrl: string | null,
  createdAt: Date,
): MediaStatus {
  if (standardUrl || thumbnailUrl) return 'READY';
  return Date.now() - createdAt.getTime() < PENDING_WINDOW_MS
    ? 'PENDING'
    : 'FAILED';
}

function isVideo(mediaType: string | null | undefined): boolean {
  return mediaType === 'video';
}

interface SlotResult {
  slot: string;
  scanned: number;
  created: number;
  ready: number;
  pending: number;
  failed: number;
}

/**
 * Pages through a slot's unlinked rows (cursor by id — works identically in
 * dry-run and apply mode, since it never depends on the filter shrinking),
 * resolves each row's Media data, and — in apply mode — links it atomically.
 */
async function processSlot<Raw extends { id: string }>(
  slot: string,
  fetchPage: (afterId: string | null) => Promise<Raw[]>,
  resolve: (raw: Raw) => Omit<MediaCreateData, 'failedAt'>,
  link: (rowId: string, data: MediaCreateData) => Promise<unknown>,
  confirm: boolean,
): Promise<SlotResult> {
  const result: SlotResult = {
    slot,
    scanned: 0,
    created: 0,
    ready: 0,
    pending: 0,
    failed: 0,
  };

  let afterId: string | null = null;
  for (;;) {
    const page = await fetchPage(afterId);
    if (page.length === 0) break;
    afterId = page[page.length - 1].id;

    const resolvedPage: ResolvedRow[] = page.map((raw) => {
      const partial = resolve(raw);
      return {
        id: raw.id,
        ...partial,
        failedAt: partial.status === 'FAILED' ? new Date() : null,
      };
    });

    result.scanned += resolvedPage.length;
    for (const row of resolvedPage) {
      if (row.status === 'READY') result.ready += 1;
      else if (row.status === 'PENDING') result.pending += 1;
      else if (row.status === 'FAILED') result.failed += 1;
    }

    if (confirm) {
      await Promise.all(
        resolvedPage.map(async (row) => {
          await link(row.id, {
            kind: row.kind,
            status: row.status,
            url: row.url,
            standardUrl: row.standardUrl,
            thumbnailUrl: row.thumbnailUrl,
            failedAt: row.failedAt,
          });
          result.created += 1;
        }),
      );
    }

    if (page.length < BATCH_SIZE) break;
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

  try {
    const results: SlotResult[] = [];

    // PostMedia (image or video via `type`)
    results.push(
      await processSlot(
        'PostMedia',
        (afterId) =>
          prisma.postMedia.findMany({
            where: {
              mediaId: null,
              ...(afterId ? { id: { gt: afterId } } : {}),
            },
            orderBy: { id: 'asc' },
            take: BATCH_SIZE,
            select: {
              id: true,
              url: true,
              standardUrl: true,
              thumbnailUrl: true,
              type: true,
              createdAt: true,
            },
          }),
        (r) => {
          const kind: MediaKind = isVideo(r.type) ? 'VIDEO' : 'IMAGE';
          return {
            url: r.url,
            standardUrl: r.standardUrl,
            thumbnailUrl: r.thumbnailUrl,
            kind,
            status:
              kind === 'VIDEO'
                ? videoStatus(r.standardUrl, r.thumbnailUrl, r.createdAt)
                : 'READY',
          };
        },
        (id, data) =>
          prisma.postMedia.update({
            where: { id },
            data: { media: { create: data } },
          }),
        confirm,
      ),
    );

    // Story (image or video via `mediaType`)
    results.push(
      await processSlot(
        'Story',
        (afterId) =>
          prisma.story.findMany({
            where: {
              mediaId: null,
              ...(afterId ? { id: { gt: afterId } } : {}),
            },
            orderBy: { id: 'asc' },
            take: BATCH_SIZE,
            select: {
              id: true,
              url: true,
              standardUrl: true,
              thumbnailUrl: true,
              mediaType: true,
              createdAt: true,
            },
          }),
        (r) => {
          const kind: MediaKind = isVideo(r.mediaType) ? 'VIDEO' : 'IMAGE';
          return {
            url: r.url,
            standardUrl: r.standardUrl,
            thumbnailUrl: r.thumbnailUrl,
            kind,
            status:
              kind === 'VIDEO'
                ? videoStatus(r.standardUrl, r.thumbnailUrl, r.createdAt)
                : 'READY',
          };
        },
        (id, data) =>
          prisma.story.update({
            where: { id },
            data: { media: { create: data } },
          }),
        confirm,
      ),
    );

    // Message media (nullable url; image/video/file via `mediaType` — "file" and null default to IMAGE)
    results.push(
      await processSlot(
        'Message.media',
        (afterId) =>
          prisma.message.findMany({
            where: {
              mediaId: null,
              url: { not: null },
              ...(afterId ? { id: { gt: afterId } } : {}),
            },
            orderBy: { id: 'asc' },
            take: BATCH_SIZE,
            select: {
              id: true,
              url: true,
              standardUrl: true,
              thumbnailUrl: true,
              mediaType: true,
              createdAt: true,
            },
          }),
        (r) => {
          const kind: MediaKind = isVideo(r.mediaType) ? 'VIDEO' : 'IMAGE';
          return {
            url: r.url as string,
            standardUrl: r.standardUrl,
            thumbnailUrl: r.thumbnailUrl,
            kind,
            status:
              kind === 'VIDEO'
                ? videoStatus(r.standardUrl, r.thumbnailUrl, r.createdAt)
                : 'READY',
          };
        },
        (id, data) =>
          prisma.message.update({
            where: { id },
            data: { media: { create: data } },
          }),
        confirm,
      ),
    );

    // Message voice notes (always audio, always ready)
    results.push(
      await processSlot(
        'Message.voice',
        (afterId) =>
          prisma.message.findMany({
            where: {
              voiceMediaId: null,
              voiceUrl: { not: null },
              ...(afterId ? { id: { gt: afterId } } : {}),
            },
            orderBy: { id: 'asc' },
            take: BATCH_SIZE,
            select: { id: true, voiceUrl: true },
          }),
        (r) => ({
          url: r.voiceUrl as string,
          standardUrl: null,
          thumbnailUrl: null,
          kind: 'AUDIO',
          status: 'READY',
        }),
        (id, data) =>
          prisma.message.update({
            where: { id },
            data: { voiceMedia: { create: data } },
          }),
        confirm,
      ),
    );

    // Comment media (nullable url; image/video/file via `mediaType`)
    results.push(
      await processSlot(
        'Comment.media',
        (afterId) =>
          prisma.comment.findMany({
            where: {
              mediaId: null,
              url: { not: null },
              ...(afterId ? { id: { gt: afterId } } : {}),
            },
            orderBy: { id: 'asc' },
            take: BATCH_SIZE,
            select: {
              id: true,
              url: true,
              standardUrl: true,
              thumbnailUrl: true,
              mediaType: true,
              createdAt: true,
            },
          }),
        (r) => {
          const kind: MediaKind = isVideo(r.mediaType) ? 'VIDEO' : 'IMAGE';
          return {
            url: r.url as string,
            standardUrl: r.standardUrl,
            thumbnailUrl: r.thumbnailUrl,
            kind,
            status:
              kind === 'VIDEO'
                ? videoStatus(r.standardUrl, r.thumbnailUrl, r.createdAt)
                : 'READY',
          };
        },
        (id, data) =>
          prisma.comment.update({
            where: { id },
            data: { media: { create: data } },
          }),
        confirm,
      ),
    );

    // Comment voice notes (always audio, always ready)
    results.push(
      await processSlot(
        'Comment.voice',
        (afterId) =>
          prisma.comment.findMany({
            where: {
              voiceMediaId: null,
              voiceUrl: { not: null },
              ...(afterId ? { id: { gt: afterId } } : {}),
            },
            orderBy: { id: 'asc' },
            take: BATCH_SIZE,
            select: { id: true, voiceUrl: true },
          }),
        (r) => ({
          url: r.voiceUrl as string,
          standardUrl: null,
          thumbnailUrl: null,
          kind: 'AUDIO',
          status: 'READY',
        }),
        (id, data) =>
          prisma.comment.update({
            where: { id },
            data: { voiceMedia: { create: data } },
          }),
        confirm,
      ),
    );

    // Profile avatar (always image, always ready)
    results.push(
      await processSlot(
        'Profile.avatar',
        (afterId) =>
          prisma.profile.findMany({
            where: {
              avatarMediaId: null,
              avatar: { not: null },
              ...(afterId ? { id: { gt: afterId } } : {}),
            },
            orderBy: { id: 'asc' },
            take: BATCH_SIZE,
            select: {
              id: true,
              avatar: true,
              standardUrl: true,
              thumbnailUrl: true,
            },
          }),
        (r) => ({
          url: r.avatar as string,
          standardUrl: r.standardUrl,
          thumbnailUrl: r.thumbnailUrl,
          kind: 'IMAGE',
          status: 'READY',
        }),
        (id, data) =>
          prisma.profile.update({
            where: { id },
            data: { avatarMedia: { create: data } },
          }),
        confirm,
      ),
    );

    // Profile cover (always image, always ready)
    results.push(
      await processSlot(
        'Profile.cover',
        (afterId) =>
          prisma.profile.findMany({
            where: {
              coverMediaId: null,
              cover: { not: null },
              ...(afterId ? { id: { gt: afterId } } : {}),
            },
            orderBy: { id: 'asc' },
            take: BATCH_SIZE,
            select: {
              id: true,
              cover: true,
              coverStandardUrl: true,
              coverThumbnailUrl: true,
            },
          }),
        (r) => ({
          url: r.cover as string,
          standardUrl: r.coverStandardUrl,
          thumbnailUrl: r.coverThumbnailUrl,
          kind: 'IMAGE',
          status: 'READY',
        }),
        (id, data) =>
          prisma.profile.update({
            where: { id },
            data: { coverMedia: { create: data } },
          }),
        confirm,
      ),
    );

    // Collection cover (always image, always ready)
    results.push(
      await processSlot(
        'Collection.cover',
        (afterId) =>
          prisma.collection.findMany({
            where: {
              mediaId: null,
              coverUrl: { not: null },
              ...(afterId ? { id: { gt: afterId } } : {}),
            },
            orderBy: { id: 'asc' },
            take: BATCH_SIZE,
            select: {
              id: true,
              coverUrl: true,
              standardUrl: true,
              thumbnailUrl: true,
            },
          }),
        (r) => ({
          url: r.coverUrl as string,
          standardUrl: r.standardUrl,
          thumbnailUrl: r.thumbnailUrl,
          kind: 'IMAGE',
          status: 'READY',
        }),
        (id, data) =>
          prisma.collection.update({
            where: { id },
            data: { media: { create: data } },
          }),
        confirm,
      ),
    );

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
            pending: results.reduce((sum, r) => sum + r.pending, 0),
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
