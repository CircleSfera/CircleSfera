import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { UploadsService } from '../uploads/uploads.service.js';
import {
  ERASURE_BATCH_SIZE,
  ERASURE_MAX_BATCHES,
  RemovedContentErasureService,
} from './removed-content-erasure.service.js';

describe('RemovedContentErasureService', () => {
  const now = new Date('2027-06-15T03:00:00Z');
  // Removed seven months before: the six months to appeal are over.
  const longAgo = new Date('2026-11-10T10:00:00Z');
  // Removed five months and a half before: still within them.
  const recently = new Date('2027-01-01T10:00:00Z');

  const tx = {
    appeal: { findFirst: vi.fn() },
    post: { deleteMany: vi.fn() },
  };
  const prisma = {
    post: { findMany: vi.fn() },
    postMedia: { findMany: vi.fn() },
    story: { findMany: vi.fn(), deleteMany: vi.fn() },
    comment: { findMany: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
  };
  const uploads = { deleteContentFiles: vi.fn() };
  const service = new RemovedContentErasureService(
    prisma as unknown as PrismaService,
    uploads as unknown as UploadsService,
  );
  const comment = (id: string, profileId: string, url: string | null) => ({
    id,
    profileId,
    url,
    standardUrl: null,
    thumbnailUrl: null,
    voiceUrl: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma.post.findMany.mockResolvedValue([]);
    prisma.story.findMany.mockResolvedValue([]);
    prisma.comment.findMany.mockResolvedValue([]);
    prisma.postMedia.findMany.mockResolvedValue([]);
    tx.appeal.findFirst.mockResolvedValue(null);
    tx.post.deleteMany.mockResolvedValue({ count: 1 });
    prisma.story.deleteMany.mockResolvedValue({ count: 1 });
    prisma.comment.deleteMany.mockResolvedValue({ count: 1 });
    uploads.deleteContentFiles.mockResolvedValue([]);
  });

  it('reads removed content of each kind by when it was removed, a batch at a time', async () => {
    await service.eraseExpired(now);

    const cutoff = new Date('2026-12-15T03:00:00Z');
    for (const model of [prisma.post, prisma.story, prisma.comment]) {
      expect(model.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { moderationStatus: 'REMOVED', moderatedAt: { lt: cutoff } },
          orderBy: { id: 'asc' },
          take: ERASURE_BATCH_SIZE,
        }),
      );
    }
    expect(uploads.deleteContentFiles).not.toHaveBeenCalled();
  });

  it('erases a removed post whose time to appeal is over, with its files and its comments’ files', async () => {
    prisma.post.findMany.mockResolvedValueOnce([
      { id: 'p-1', profileId: 'author', moderatedAt: longAgo },
    ]);
    prisma.postMedia.findMany.mockResolvedValueOnce([
      {
        url: '/uploads/a.jpg',
        standardUrl: null,
        thumbnailUrl: '/uploads/t.jpg',
      },
    ]);
    prisma.comment.findMany
      // The post's comments.
      .mockResolvedValueOnce([
        comment('c-1', 'friend', '/uploads/c.jpg'),
        comment('c-2', 'other', null),
      ])
      // No removed comments of their own.
      .mockResolvedValueOnce([]);

    await service.eraseExpired(now);

    expect(tx.appeal.findFirst).toHaveBeenCalledWith({
      where: { targetType: 'POST_REMOVAL', targetId: 'p-1', status: 'PENDING' },
      select: { id: true },
    });
    expect(tx.post.deleteMany).toHaveBeenCalledWith({
      where: { id: 'p-1', moderationStatus: 'REMOVED', moderatedAt: longAgo },
    });
    // Each file as its author's; a comment without files is not asked for.
    expect(uploads.deleteContentFiles.mock.calls).toEqual([
      ['author', ['/uploads/a.jpg', null, '/uploads/t.jpg']],
      ['friend', ['/uploads/c.jpg', null, null, null]],
    ]);
    expect(Logger.prototype.log).toHaveBeenCalledWith(
      'Erased 1 removed posts whose time to appeal was over.',
    );
  });

  it('keeps a post with an appeal still open, one still within its six months, and one taken by another server', async () => {
    prisma.post.findMany.mockResolvedValueOnce([
      { id: 'p-open', profileId: 'a', moderatedAt: longAgo },
      { id: 'p-recent', profileId: 'a', moderatedAt: recently },
      { id: 'p-none', profileId: 'a', moderatedAt: null },
      { id: 'p-taken', profileId: 'a', moderatedAt: longAgo },
    ]);
    tx.appeal.findFirst.mockResolvedValueOnce({ id: 'appeal-1' });
    tx.post.deleteMany.mockResolvedValueOnce({ count: 0 });

    await service.eraseExpired(now);

    expect(tx.post.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.post.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'p-taken',
        moderationStatus: 'REMOVED',
        moderatedAt: longAgo,
      },
    });
    expect(uploads.deleteContentFiles).not.toHaveBeenCalled();
    expect(Logger.prototype.log).not.toHaveBeenCalled();
  });

  it('erases a removed story with its files, unless another server took it', async () => {
    const story = {
      profileId: 'author',
      moderatedAt: longAgo,
      url: '/uploads/s.mp4',
      standardUrl: '/uploads/s/master.m3u8',
      thumbnailUrl: null,
      overlayUrl: '/uploads/o.png',
    };
    prisma.story.findMany.mockResolvedValueOnce([
      { id: 's-1', ...story },
      { id: 's-2', ...story },
    ]);
    prisma.story.deleteMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await service.eraseExpired(now);

    expect(prisma.story.deleteMany).toHaveBeenCalledWith({
      where: { id: 's-1', moderationStatus: 'REMOVED', moderatedAt: longAgo },
    });
    expect(uploads.deleteContentFiles.mock.calls).toEqual([
      [
        'author',
        ['/uploads/s.mp4', '/uploads/s/master.m3u8', null, '/uploads/o.png'],
      ],
    ]);
  });

  it('erases a removed comment with every reply under it, and each one’s files as its author’s', async () => {
    prisma.comment.findMany.mockImplementation(
      async (args: { where: { parentId?: { in: string[] } } }) => {
        const parents = args.where.parentId?.in;
        if (!parents) {
          return [
            {
              moderatedAt: longAgo,
              ...comment('c-1', 'author', '/uploads/c1.jpg'),
            },
          ];
        }
        if (parents.includes('c-1')) {
          return [comment('r-1', 'friend', '/uploads/r1.jpg')];
        }
        if (parents.includes('r-1')) {
          return [comment('r-2', 'other', '/uploads/r2.jpg')];
        }
        return [];
      },
    );

    await service.eraseExpired(now);

    expect(prisma.comment.deleteMany).toHaveBeenCalledWith({
      where: { id: 'c-1', moderationStatus: 'REMOVED', moderatedAt: longAgo },
    });
    expect(uploads.deleteContentFiles.mock.calls).toEqual([
      ['author', ['/uploads/c1.jpg', null, null, null]],
      ['friend', ['/uploads/r1.jpg', null, null, null]],
      ['other', ['/uploads/r2.jpg', null, null, null]],
    ]);
  });

  it('does not release the files of a comment another server took', async () => {
    prisma.comment.findMany
      .mockResolvedValueOnce([
        { moderatedAt: longAgo, ...comment('c-1', 'a', '/uploads/c.jpg') },
      ])
      .mockResolvedValueOnce([]);
    prisma.comment.deleteMany.mockResolvedValueOnce({ count: 0 });

    await service.eraseExpired(now);

    expect(uploads.deleteContentFiles).not.toHaveBeenCalled();
  });

  it('goes on to the next batch while batches are full, up to the night’s limit', async () => {
    const full = (prefix: string) =>
      Array.from({ length: ERASURE_BATCH_SIZE }, (_, i) => ({
        id: `${prefix}-${String(i).padStart(3, '0')}`,
        profileId: 'a',
        moderatedAt: recently,
      }));
    prisma.post.findMany.mockResolvedValueOnce(full('a'));
    prisma.post.findMany.mockResolvedValueOnce([]);

    await service.eraseExpired(now);

    expect(prisma.post.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ id: { gt: 'a-099' } }),
      }),
    );

    prisma.post.findMany.mockReset();
    prisma.post.findMany.mockImplementation(async () => full('b'));
    await service.eraseExpired(now);
    expect(prisma.post.findMany).toHaveBeenCalledTimes(ERASURE_MAX_BATCHES);
  });

  it('never throws: a kind that fails is logged and the others still run, and a file that cannot go is left', async () => {
    prisma.post.findMany.mockRejectedValueOnce(new Error('db down'));
    prisma.story.findMany.mockResolvedValueOnce([
      {
        id: 's-1',
        profileId: 'author',
        moderatedAt: longAgo,
        url: '/uploads/s.jpg',
        standardUrl: null,
        thumbnailUrl: null,
        overlayUrl: null,
      },
    ]);
    uploads.deleteContentFiles.mockRejectedValueOnce(new Error('storage'));
    uploads.deleteContentFiles.mockRejectedValueOnce('storage');

    await expect(service.eraseExpired(now)).resolves.toBeUndefined();
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      'Error erasing removed posts',
      expect.any(Error),
    );
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      'Files of erased content kept: storage',
    );
    expect(Logger.prototype.log).toHaveBeenCalledWith(
      'Erased 1 removed stories whose time to appeal was over.',
    );

    // A failure that is not an Error is said as it is.
    prisma.story.findMany.mockResolvedValueOnce([
      {
        id: 's-2',
        profileId: 'author',
        moderatedAt: longAgo,
        url: '/uploads/s2.jpg',
        standardUrl: null,
        thumbnailUrl: null,
        overlayUrl: null,
      },
    ]);
    await service.eraseExpired(now);
    expect(Logger.prototype.warn).toHaveBeenLastCalledWith(
      'Files of erased content kept: storage',
    );
  });

  it('runs at the time of the night it is called with no date', async () => {
    await expect(service.eraseExpired()).resolves.toBeUndefined();
  });
});
