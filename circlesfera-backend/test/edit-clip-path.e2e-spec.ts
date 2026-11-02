import { Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { EditsService } from '../src/edits/edits.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { EDIT_CLIP_ADDRESSES } from '../src/uploads/services/media-references.service.js';

// The clips the database reads in a studio draft's state (media access and
// the nightly sweep) must be exactly the clips the studio checks as the
// author's own files. Any clip the database reads that the check skips would
// let a person make another person's file private to them, or keep it from
// being erased.
const prisma = new PrismaService(process.env.DATABASE_URL as string);
const editsWithoutDeps = new EditsService(
  prisma,
  undefined as never,
  undefined as never,
  undefined as never,
  undefined as never,
);
// A state the check cannot walk (tracks or clips that are not lists) is
// refused with the request, so it is never saved: nothing of it is checked.
const checked = (state: unknown): string[] => {
  try {
    return (
      editsWithoutDeps as unknown as {
        collectStudioMediaUrls(state: unknown): string[];
      }
    ).collectStudioMediaUrls(state);
  } catch {
    return [];
  }
};

async function read(state: unknown): Promise<string[]> {
  const [row] = await prisma.$queryRaw<Array<{ clips: string[] }>>`
    SELECT ${EDIT_CLIP_ADDRESSES} AS clips
    FROM (SELECT ${JSON.stringify(state)}::jsonb AS "state") e`;
  return row.clips;
}

const clip = (fileUrl: string, type = 'video') => ({ type, fileUrl });

const SHAPES: Array<[string, unknown]> = [
  [
    'an ordinary draft',
    {
      version: 3,
      studio: {
        tracks: [
          { clips: [clip('/uploads/a.mp4'), clip('/uploads/t.mp4', 'text')] },
          { clips: [] },
          {},
          { clips: [{ fileUrl: '/uploads/no-type.mp4' }] },
        ],
      },
    },
  ],
  [
    'a track nested in a further array',
    {
      version: 3,
      studio: { tracks: [[{ clips: [clip('/uploads/v1.jpg')] }]] },
    },
  ],
  [
    'a clip nested in a further array',
    {
      version: 3,
      studio: { tracks: [{ clips: [[clip('/uploads/v2.jpg')]] }] },
    },
  ],
  [
    'tracks written as an object',
    { version: 3, studio: { tracks: { clips: [clip('/uploads/v3.jpg')] } } },
  ],
  [
    'clips written as an object',
    { version: 3, studio: { tracks: [{ clips: clip('/uploads/v4.jpg') }] } },
  ],
  [
    'a studio written as an array',
    {
      version: 3,
      studio: [{ tracks: [{ clips: [clip('/uploads/v5.jpg')] }] }],
    },
  ],
  [
    'a mix of a real clip and nested ones',
    {
      version: 3,
      studio: {
        tracks: [
          { clips: [clip('/uploads/mine.mp4'), [clip('/uploads/v6.jpg')]] },
          [{ clips: [clip('/uploads/v7.jpg')] }],
        ],
      },
    },
  ],
  [
    'another version',
    { version: 2, studio: { tracks: [{ clips: [clip('/uploads/v8.jpg')] }] } },
  ],
  [
    'a version written as text',
    {
      version: '3',
      studio: { tracks: [{ clips: [clip('/uploads/v9.jpg')] }] },
    },
  ],
  [
    'a file still on the device',
    { version: 3, studio: { tracks: [{ clips: [clip('blob:x/v10.jpg')] }] } },
  ],
  ['a state that is an array', [{ version: 3 }]],
];

describe('Clips of a studio draft (real database)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each(SHAPES)(
    'reads in %s only the clips the studio checks',
    async (_name, state) => {
      expect((await read(state)).sort()).toEqual(checked(state).sort());
    },
  );

  it('never reads a clip nested in a further array', async () => {
    const clips = await read(SHAPES[6][1]);
    expect(clips).toEqual(['/uploads/mine.mp4']);
  });

  it('finds the drafts naming a file through the index', async () => {
    // A small table may be read whole; with sequential scans off, the index
    // must be the way in, which proves the query's expression is the index's.
    const plan = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
      return tx.$queryRaw<Array<{ 'QUERY PLAN': string }>>(
        Prisma.sql`EXPLAIN (COSTS OFF) SELECT 1 FROM "edit_projects" e WHERE ${EDIT_CLIP_ADDRESSES} ?| ${['/uploads/a.mp4']}::text[]`,
      );
    });
    expect(plan.map((row) => row['QUERY PLAN']).join('\n')).toContain(
      'edit_projects_clip_addresses_idx',
    );
  });
});
