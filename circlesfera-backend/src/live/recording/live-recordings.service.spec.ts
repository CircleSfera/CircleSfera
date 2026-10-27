import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { UploadsService } from '../../uploads/uploads.service.js';
import {
  LiveRecordingsService,
  replayFileKey,
} from './live-recordings.service.js';

const NOW = new Date('2026-10-27T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const FOLDER = '0f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f';
const REPLAY = `/uploads/${FOLDER}/master.m3u8`;
const KEY = `/uploads/${FOLDER}.mp4`;

const HELD_A = {
  recordingStatus: 'READY',
  publishedAt: null,
  endedByStaff: false,
};
const HELD_B = {
  recordingStatus: 'READY',
  publishedAt: new Date(),
  endedByStaff: false,
};

describe('LiveRecordingsService', () => {
  const prisma = {
    liveStream: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    block: { findFirst: vi.fn() },
    profile: { findUnique: vi.fn(), findMany: vi.fn() },
    user: { findMany: vi.fn() },
    follow: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  // The transaction a deletion runs in, apart from the service's client.
  const tx = {
    liveStream: { updateMany: vi.fn(), update: vi.fn() },
    $queryRaw: vi.fn(),
  };
  const uploads = {
    releaseContentFiles: vi.fn(async () => undefined),
    deleteContentFiles: vi.fn(async () => [KEY]),
    deleteFilesOfErasedContent: vi.fn(async () => [KEY]),
  };
  const service = new LiveRecordingsService(
    prisma as unknown as PrismaService,
    uploads as unknown as UploadsService,
  );
  const row = (over: Record<string, unknown> = {}) => ({
    id: 's1',
    title: 'Hello',
    startedAt: daysAgo(3),
    endedAt: daysAgo(3),
    recordingStatus: 'READY',
    recordingDurationMs: 60_000,
    replayUrl: REPLAY,
    thumbnailUrl: `/uploads/${FOLDER}/thumb.jpg`,
    publishedAt: null,
    ...over,
  });
  let recordings: string;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.liveStream.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(
      async (work: (client: typeof tx) => unknown) => work(tx),
    );
    tx.liveStream.updateMany.mockResolvedValue({ count: 1 });
    tx.liveStream.update.mockResolvedValue({});
    tx.$queryRaw.mockResolvedValue([]);
    prisma.liveStream.findMany.mockResolvedValue([]);
    prisma.block.findFirst.mockResolvedValue(null);
    prisma.profile.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.profile.findUnique.mockResolvedValue({ privacyLevel: 'PUBLIC' });
    recordings = fs.mkdtempSync(path.join(os.tmpdir(), 'live-recordings-'));
    vi.stubEnv('LIVE_RECORDINGS_DIR', recordings);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    fs.rmSync(recordings, { recursive: true, force: true });
  });

  it('names the stored file a replay is recorded under', () => {
    expect(replayFileKey(REPLAY)).toBe(KEY);
    expect(replayFileKey('https://cdn.example.com/x/master.m3u8')).toBeNull();
    expect(replayFileKey(null)).toBeNull();
  });

  describe('getOwn', () => {
    it("answers the host's recording with the days left", async () => {
      prisma.liveStream.findFirst.mockResolvedValue({
        ...row(),
        endedByStaff: false,
      });
      const own = await service.getOwn('host', 's1', NOW);
      expect(prisma.liveStream.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 's1', hostId: 'host' } }),
      );
      expect(own).toMatchObject({ recordingStatus: 'READY', daysLeft: 27 });
    });

    it('answers a broadcast still on air with no days', async () => {
      prisma.liveStream.findFirst.mockResolvedValue({
        ...row({ endedAt: null, recordingStatus: 'RECORDING' }),
        endedByStaff: false,
      });
      expect(await service.getOwn('host', 's1')).toMatchObject({
        daysLeft: null,
      });
    });

    it('answers a published recording with no days', async () => {
      prisma.liveStream.findFirst.mockResolvedValue({
        ...row({ publishedAt: daysAgo(1) }),
        endedByStaff: false,
      });
      expect(await service.getOwn('host', 's1', NOW)).toMatchObject({
        daysLeft: null,
      });
    });

    it('never offers the host the recording of a broadcast ended by staff', async () => {
      prisma.liveStream.findFirst.mockResolvedValue({
        ...row(),
        endedByStaff: true,
      });
      expect(await service.getOwn('host', 's1', NOW)).toEqual(
        expect.objectContaining({
          recordingStatus: 'NONE',
          replayUrl: null,
          thumbnailUrl: null,
          daysLeft: null,
        }),
      );
    });

    it("answers another's broadcast as missing", async () => {
      prisma.liveStream.findFirst.mockResolvedValue(null);
      await expect(service.getOwn('host', 's1')).rejects.toThrow(AppException);
    });
  });

  it('lists the archive of recordings not published, of the last 30 days', async () => {
    prisma.liveStream.findMany.mockResolvedValue([
      row(),
      row({ id: 's2', endedAt: daysAgo(29.5) }),
    ]);
    const archive = await service.listArchive('host', NOW);
    expect(prisma.liveStream.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          hostId: 'host',
          status: 'ENDED',
          endedByStaff: false,
          publishedAt: null,
          recordingStatus: { in: ['PROCESSING', 'READY'] },
          endedAt: { gte: daysAgo(30) },
        },
      }),
    );
    expect(archive.map((item) => item.daysLeft)).toEqual([27, 1]);
    expect(await service.listArchive('host')).toBeDefined();
  });

  it('never counts fewer than no days left', async () => {
    prisma.liveStream.findMany.mockResolvedValue([
      row({ endedAt: daysAgo(31) }),
    ]);
    const [item] = await service.listArchive('host', NOW);
    expect(item.daysLeft).toBe(0);
  });

  describe('listPublished', () => {
    it('lists a page of published recordings, with the cursor of the next', async () => {
      prisma.liveStream.findMany.mockResolvedValue([
        row({ id: 'a', publishedAt: NOW }),
        row({ id: 'b', publishedAt: NOW }),
        row({ id: 'c', publishedAt: NOW }),
      ]);
      const page = await service.listPublished('host', 'viewer', 'z', 2);
      expect(prisma.liveStream.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            hostId: 'host',
            endedByStaff: false,
            recordingStatus: 'READY',
            publishedAt: { not: null },
          },
          take: 3,
          cursor: { id: 'z' },
          skip: 1,
        }),
      );
      expect(page.data.map((item) => item.id)).toEqual(['a', 'b']);
      expect(page.nextCursor).toBe('b');
    });

    it('answers the last page with no cursor', async () => {
      prisma.liveStream.findMany.mockResolvedValue([row({ id: 'a' })]);
      const page = await service.listPublished('host', null);
      expect(page.nextCursor).toBeNull();
      expect(prisma.liveStream.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 13 }),
      );
      await service.listPublished('host', null, undefined, 500);
      expect(prisma.liveStream.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ take: 51 }),
      );
    });

    it('lists none across a block', async () => {
      prisma.block.findFirst.mockResolvedValue({ id: 'b' });
      expect(await service.listPublished('host', 'viewer')).toEqual({
        data: [],
        nextCursor: null,
      });
      expect(prisma.liveStream.findMany).not.toHaveBeenCalled();
    });
  });

  describe('publish', () => {
    it('puts a ready recording on the Profile', async () => {
      prisma.liveStream.findFirst.mockResolvedValue({
        status: 'ENDED',
        recordingStatus: 'READY',
        replayUrl: REPLAY,
        publishedAt: null,
      });
      const result = await service.publish('host', 's1');
      expect(result.publishedAt).toBeInstanceOf(Date);
      expect(prisma.liveStream.updateMany).toHaveBeenCalledWith({
        where: {
          id: 's1',
          hostId: 'host',
          recordingStatus: 'READY',
          publishedAt: null,
        },
        data: { publishedAt: result.publishedAt },
      });
    });

    it('answers a recording already published as it is', async () => {
      const publishedAt = daysAgo(1);
      prisma.liveStream.findFirst.mockResolvedValue({
        status: 'ENDED',
        recordingStatus: 'READY',
        replayUrl: REPLAY,
        publishedAt,
      });
      expect(await service.publish('host', 's1')).toEqual({ publishedAt });
      expect(prisma.liveStream.updateMany).not.toHaveBeenCalled();
    });

    it("refuses another's recording, or one of a broadcast ended by staff, as missing", async () => {
      prisma.liveStream.findFirst.mockResolvedValue(null);
      await expect(service.publish('host', 's1')).rejects.toMatchObject({
        status: 404,
      });
      expect(prisma.liveStream.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 's1', hostId: 'host', endedByStaff: false },
        }),
      );
    });

    it.each([
      [{ status: 'LIVE', recordingStatus: 'RECORDING' }],
      [{ status: 'ENDED', recordingStatus: 'PROCESSING' }],
      [{ status: 'ENDED', recordingStatus: 'NONE' }],
    ])('refuses a recording not ready (%o)', async (state) => {
      prisma.liveStream.findFirst.mockResolvedValue({
        ...state,
        replayUrl: null,
        publishedAt: null,
      });
      await expect(service.publish('host', 's1')).rejects.toMatchObject({
        status: 409,
      });
    });
  });

  describe('remove', () => {
    beforeEach(() => {
      prisma.liveStream.findFirst.mockResolvedValue({
        status: 'ENDED',
        recordingStatus: 'READY',
        replayUrl: REPLAY,
        publishedAt: NOW,
      });
    });

    it('deletes the recording and sets its files aside in one transaction', async () => {
      expect(await service.remove('host', 's1')).toEqual({ success: true });
      expect(tx.liveStream.updateMany).toHaveBeenCalledWith({
        where: { id: 's1', hostId: 'host', recordingStatus: 'READY' },
        data: {
          recordingStatus: 'NONE',
          replayUrl: null,
          thumbnailUrl: null,
          publishedAt: null,
        },
      });
      expect(uploads.releaseContentFiles).toHaveBeenCalledWith([KEY], tx);
      expect(prisma.liveStream.updateMany).not.toHaveBeenCalled();
    });

    it('releases nothing when another request deleted it first', async () => {
      tx.liveStream.updateMany.mockResolvedValue({ count: 0 });
      await service.remove('host', 's1');
      expect(uploads.releaseContentFiles).not.toHaveBeenCalled();
    });

    it('fails, and so keeps the recording, when its files cannot be set aside', async () => {
      uploads.releaseContentFiles.mockRejectedValueOnce(new Error('db down'));
      await expect(service.remove('host', 's1')).rejects.toThrow('db down');
    });
  });

  describe('eraseExpired', () => {
    it('deletes at once, a page at a time, the recordings never published within 30 days', async () => {
      prisma.liveStream.findMany
        .mockResolvedValueOnce([
          { id: 'a', hostId: 'h1', replayUrl: REPLAY, endedAt: daysAgo(31) },
          { id: 'b', hostId: 'h2', replayUrl: REPLAY, endedAt: daysAgo(31) },
        ])
        .mockResolvedValueOnce([]);
      tx.$queryRaw
        .mockResolvedValueOnce([HELD_A])
        // Published meanwhile: the row held says so, and it is kept.
        .mockResolvedValueOnce([HELD_B]);

      expect(await service.eraseExpired(NOW)).toBe(1);
      expect(prisma.liveStream.findMany).toHaveBeenNthCalledWith(1, {
        where: {
          recordingStatus: 'READY',
          publishedAt: null,
          endedByStaff: false,
          endedAt: { lt: daysAgo(30) },
        },
        select: { id: true, hostId: true, replayUrl: true, endedAt: true },
        orderBy: { id: 'asc' },
        take: 100,
      });
      // Held first, then its files, then the row.
      expect(tx.$queryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
      expect(uploads.deleteFilesOfErasedContent).toHaveBeenCalledTimes(1);
      expect(uploads.deleteFilesOfErasedContent).toHaveBeenCalledWith(
        'h1',
        [KEY],
        { liveStream: ['a'] },
      );
      expect(tx.liveStream.update).toHaveBeenCalledWith({
        where: { id: 'a' },
        data: { recordingStatus: 'NONE', replayUrl: null, thumbnailUrl: null },
      });
      expect(
        uploads.deleteFilesOfErasedContent.mock.invocationCallOrder[0],
      ).toBeLessThan(tx.liveStream.update.mock.invocationCallOrder[0]);
      expect(prisma.liveStream.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({ id: { gt: 'b' } }),
        }),
      );
    });

    it('deletes the recordings of broadcasts ended by staff once their six months of review are over', async () => {
      prisma.liveStream.findMany
        // Those of the host's archive: none.
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          // Six months and a day: its window is over.
          {
            id: 'x',
            hostId: 'h1',
            replayUrl: REPLAY,
            endedAt: new Date('2026-04-26T12:00:00Z'),
          },
          // Read by the query's cutoff but still in its window by the day.
          {
            id: 'y',
            hostId: 'h2',
            replayUrl: REPLAY,
            endedAt: new Date('2026-04-27T13:00:00Z'),
          },
          { id: 'z', hostId: 'h3', replayUrl: REPLAY, endedAt: null },
        ])
        .mockResolvedValueOnce([]);
      tx.$queryRaw.mockResolvedValueOnce([
        { recordingStatus: 'READY', publishedAt: null, endedByStaff: true },
      ]);

      expect(await service.eraseExpired(NOW)).toBe(1);
      expect(prisma.liveStream.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: {
            recordingStatus: 'READY',
            publishedAt: null,
            endedByStaff: true,
            endedAt: { lt: new Date('2026-04-27T12:00:00Z') },
          },
        }),
      );
      expect(tx.liveStream.update).toHaveBeenCalledTimes(1);
      expect(uploads.deleteFilesOfErasedContent).toHaveBeenCalledWith(
        'h1',
        [KEY],
        { liveStream: ['x'] },
      );
    });

    it('keeps a recording whose row is gone or no longer of its kind', async () => {
      prisma.liveStream.findMany
        .mockResolvedValueOnce([
          { id: 'a', hostId: 'h1', replayUrl: REPLAY, endedAt: daysAgo(31) },
          { id: 'b', hostId: 'h2', replayUrl: REPLAY, endedAt: daysAgo(31) },
          { id: 'c', hostId: 'h3', replayUrl: REPLAY, endedAt: daysAgo(31) },
        ])
        .mockResolvedValueOnce([]);
      tx.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { recordingStatus: 'NONE', publishedAt: null, endedByStaff: false },
        ])
        .mockResolvedValueOnce([
          { recordingStatus: 'READY', publishedAt: null, endedByStaff: true },
        ]);

      expect(await service.eraseExpired(NOW)).toBe(0);
      expect(uploads.deleteFilesOfErasedContent).not.toHaveBeenCalled();
    });

    it('keeps the row, and goes on with the others, when its files cannot be deleted', async () => {
      prisma.liveStream.findMany
        .mockResolvedValueOnce([
          { id: 'a', hostId: 'h1', replayUrl: REPLAY, endedAt: daysAgo(31) },
          { id: 'b', hostId: 'h2', replayUrl: REPLAY, endedAt: daysAgo(31) },
        ])
        .mockResolvedValueOnce([]);
      tx.$queryRaw.mockResolvedValue([HELD_A]);
      uploads.deleteFilesOfErasedContent
        .mockRejectedValueOnce(new Error('disk'))
        .mockRejectedValueOnce('disk');
      expect(await service.eraseExpired(NOW)).toBe(0);
      expect(uploads.deleteFilesOfErasedContent).toHaveBeenCalledTimes(2);
      expect(tx.liveStream.update).not.toHaveBeenCalled();
    });

    it("deletes the recorder's files left more than 48 hours, and fails a replay waiting for one", async () => {
      const old = 'live-11111111-2222-4333-8444-555555555555-host.mp4';
      const oldCoHost =
        'live-11111111-2222-4333-8444-555555555555-cohost-2.mp4';
      const fresh = 'live-11111111-2222-4333-8444-666666666666-host.mp4';
      const other = 'live-11111111-2222-4333-8444-555555555555.mp4';
      for (const name of [old, oldCoHost, fresh, other, 'notes.txt']) {
        fs.writeFileSync(path.join(recordings, name), 'raw');
      }
      const longAgo = daysAgo(3);
      for (const name of [old, oldCoHost, other, 'notes.txt']) {
        fs.utimesSync(path.join(recordings, name), longAgo, longAgo);
      }

      await service.eraseExpired(NOW);

      expect(fs.readdirSync(recordings).sort()).toEqual(
        [fresh, other, 'notes.txt'].sort(),
      );
      expect(prisma.liveStream.updateMany).toHaveBeenCalledWith({
        where: { recordingFile: old, recordingStatus: 'PROCESSING' },
        data: { recordingStatus: 'FAILED' },
      });
      expect(prisma.liveStream.updateMany).toHaveBeenCalledWith({
        where: { recordingFile: old },
        data: { recordingFile: null },
      });
    });

    it("keeps a recorder's file whose rows cannot be updated, and goes on with the others", async () => {
      const names = [
        'live-11111111-2222-4333-8444-555555555555-host.mp4',
        'live-11111111-2222-4333-8444-666666666666-host.mp4',
      ];
      const long = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000);
      for (const name of names) {
        const file = path.join(recordings, name);
        fs.writeFileSync(file, 'raw');
        fs.utimesSync(file, long, long);
      }
      prisma.liveStream.updateMany
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValue({ count: 0 });

      await service.eraseExpired(NOW);

      // The rows first: the file whose rows failed is still there.
      const left = names.filter((name) =>
        fs.existsSync(path.join(recordings, name)),
      );
      expect(left).toHaveLength(1);
    });

    it("skips a recorder's file that vanished while being read", async () => {
      fs.writeFileSync(
        path.join(
          recordings,
          'live-11111111-2222-4333-8444-555555555555-host.mp4',
        ),
        'raw',
      );
      vi.spyOn(fs.promises, 'stat').mockRejectedValue(new Error('gone'));
      await service.eraseExpired(NOW);
      expect(prisma.liveStream.updateMany).not.toHaveBeenCalled();
    });

    it("does nothing with a recorder's folder that is not there", async () => {
      vi.stubEnv('LIVE_RECORDINGS_DIR', path.join(recordings, 'missing'));
      await expect(service.eraseExpired(NOW)).resolves.toBe(0);
    });

    it('never throws out of the schedule', async () => {
      prisma.liveStream.findMany.mockRejectedValue(new Error('db down'));
      await expect(service.eraseExpired()).resolves.toBe(0);
      prisma.liveStream.findMany.mockRejectedValue('db down');
      await expect(service.eraseExpired()).resolves.toBe(0);
    });
  });
});
