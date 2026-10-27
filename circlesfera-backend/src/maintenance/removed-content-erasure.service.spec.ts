import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { UploadsService } from '../uploads/uploads.service.js';
import {
  ERASURE_BATCH_SIZE,
  ERASURE_MAX_BATCHES,
  ERASURE_TRANSACTION_TIMEOUT_MS,
  RemovedContentErasureService,
} from './removed-content-erasure.service.js';

describe('RemovedContentErasureService', () => {
  const now = new Date('2027-06-15T03:00:00Z');
  // Removed seven months before: the six months to appeal are over.
  const longAgo = new Date('2026-11-10T10:00:00Z');
  // Removed five months and a half before: still within them.
  const recently = new Date('2027-01-01T10:00:00Z');

  const tx = {
    $queryRaw: vi.fn(),
    appeal: { findFirst: vi.fn() },
    postMedia: { findMany: vi.fn() },
    post: { delete: vi.fn() },
    story: { delete: vi.fn() },
    comment: { findMany: vi.fn(), delete: vi.fn() },
  };
  const prisma = {
    post: { findMany: vi.fn() },
    story: { findMany: vi.fn() },
    comment: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  const uploads = { deleteFilesOfErasedContent: vi.fn() };
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
  const held = (moderatedAt: Date | null = longAgo, status = 'REMOVED') => [
    { moderationStatus: status, moderatedAt },
  ];
  // What each step did, in order: holding the row, deleting files, rows.
  const steps: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    steps.length = 0;
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma.post.findMany.mockResolvedValue([]);
    prisma.story.findMany.mockResolvedValue([]);
    prisma.comment.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(
      async (run: (client: typeof tx) => unknown) => run(tx),
    );
    tx.$queryRaw.mockImplementation(async () => {
      steps.push('hold');
      return held();
    });
    tx.appeal.findFirst.mockResolvedValue(null);
    tx.postMedia.findMany.mockResolvedValue([]);
    tx.comment.findMany.mockResolvedValue([]);
    for (const model of [tx.post, tx.story, tx.comment]) {
      model.delete.mockImplementation(async () => {
        steps.push('delete row');
        return {};
      });
    }
    uploads.deleteFilesOfErasedContent.mockImplementation(async () => {
      steps.push('delete files');
      return [];
    });
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
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('holds a post, checks for an open appeal, deletes its files and its comments’ files, then the row', async () => {
    prisma.post.findMany.mockResolvedValueOnce([
      { id: 'p-1', profileId: 'author', moderatedAt: longAgo },
    ]);
    tx.postMedia.findMany.mockResolvedValueOnce([
      {
        id: 'm-1',
        url: '/uploads/a.jpg',
        standardUrl: null,
        thumbnailUrl: '/uploads/t.jpg',
      },
    ]);
    tx.comment.findMany.mockResolvedValueOnce([
      comment('c-1', 'friend', '/uploads/c.jpg'),
      comment('c-2', 'other', null),
    ]);

    await service.eraseExpired(now);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: ERASURE_TRANSACTION_TIMEOUT_MS,
    });
    const [sql, id] = tx.$queryRaw.mock.calls[0];
    expect(sql.join('?')).toContain('FROM posts');
    expect(sql.join('?')).toContain('FOR UPDATE');
    expect(id).toBe('p-1');
    expect(tx.appeal.findFirst).toHaveBeenCalledWith({
      where: { targetType: 'POST_REMOVAL', targetId: 'p-1', status: 'PENDING' },
      select: { id: true },
    });
    // The rows being erased do not count as a use of their own files; a
    // comment without files is not asked for.
    const ignoring = { postMedia: ['m-1'], comment: ['c-1', 'c-2'] };
    expect(uploads.deleteFilesOfErasedContent.mock.calls).toEqual([
      ['author', ['/uploads/a.jpg', null, '/uploads/t.jpg'], ignoring],
      ['friend', ['/uploads/c.jpg', null, null, null], ignoring],
    ]);
    expect(tx.post.delete).toHaveBeenCalledWith({ where: { id: 'p-1' } });
    expect(steps).toEqual([
      'hold',
      'delete files',
      'delete files',
      'delete row',
    ]);
    expect(Logger.prototype.log).toHaveBeenCalledWith(
      'Erased 1 removed posts whose time to appeal was over.',
    );
  });

  it('keeps a post with an appeal still open, one within its six months, one no longer the same removal, and one already gone', async () => {
    prisma.post.findMany.mockResolvedValueOnce([
      { id: 'p-open', profileId: 'a', moderatedAt: longAgo },
      { id: 'p-recent', profileId: 'a', moderatedAt: recently },
      { id: 'p-none', profileId: 'a', moderatedAt: null },
      { id: 'p-again', profileId: 'a', moderatedAt: longAgo },
      { id: 'p-shown', profileId: 'a', moderatedAt: longAgo },
      { id: 'p-gone', profileId: 'a', moderatedAt: longAgo },
    ]);
    tx.appeal.findFirst.mockResolvedValueOnce({ id: 'appeal-1' });
    tx.$queryRaw
      .mockResolvedValueOnce(held())
      // Removed again since it was read: a new decision, a new six months.
      .mockResolvedValueOnce(held(new Date('2027-06-01T00:00:00Z')))
      // Restored on appeal since it was read.
      .mockResolvedValueOnce(held(longAgo, 'VISIBLE'))
      // Erased by another server, which held it first.
      .mockResolvedValueOnce([]);

    await service.eraseExpired(now);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
    expect(uploads.deleteFilesOfErasedContent).not.toHaveBeenCalled();
    expect(tx.post.delete).not.toHaveBeenCalled();
    expect(Logger.prototype.log).not.toHaveBeenCalled();
  });

  it('erases a removed story with its files first', async () => {
    prisma.story.findMany.mockResolvedValueOnce([
      {
        id: 's-1',
        profileId: 'author',
        moderatedAt: longAgo,
        url: '/uploads/s.mp4',
        standardUrl: '/uploads/s/master.m3u8',
        thumbnailUrl: null,
        overlayUrl: '/uploads/o.png',
      },
    ]);

    await service.eraseExpired(now);

    expect(tx.$queryRaw.mock.calls[0][0].join('?')).toContain('FROM stories');
    expect(uploads.deleteFilesOfErasedContent.mock.calls).toEqual([
      [
        'author',
        ['/uploads/s.mp4', '/uploads/s/master.m3u8', null, '/uploads/o.png'],
        { story: ['s-1'] },
      ],
    ]);
    expect(tx.story.delete).toHaveBeenCalledWith({ where: { id: 's-1' } });
    expect(steps).toEqual(['hold', 'delete files', 'delete row']);
  });

  it('keeps a story another server already took', async () => {
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
    tx.$queryRaw.mockResolvedValueOnce([]);

    await service.eraseExpired(now);

    expect(uploads.deleteFilesOfErasedContent).not.toHaveBeenCalled();
    expect(tx.story.delete).not.toHaveBeenCalled();
  });

  it('erases a removed comment with every reply under it, and each one’s files as its author’s', async () => {
    prisma.comment.findMany.mockResolvedValueOnce([
      { moderatedAt: longAgo, ...comment('c-1', 'author', '/uploads/c1.jpg') },
    ]);
    tx.comment.findMany.mockImplementation(
      async (args: { where: { parentId: { in: string[] } } }) => {
        const parents = args.where.parentId.in;
        if (parents.includes('c-1')) {
          return [comment('r-1', 'friend', '/uploads/r1.jpg')];
        }
        if (parents.includes('r-1')) {
          return [comment('r-2', 'other', null)];
        }
        return [];
      },
    );

    await service.eraseExpired(now);

    expect(tx.$queryRaw.mock.calls[0][0].join('?')).toContain('FROM comments');
    const ignoring = { comment: ['c-1', 'r-1', 'r-2'] };
    expect(uploads.deleteFilesOfErasedContent.mock.calls).toEqual([
      ['author', ['/uploads/c1.jpg', null, null, null], ignoring],
      ['friend', ['/uploads/r1.jpg', null, null, null], ignoring],
    ]);
    expect(tx.comment.delete).toHaveBeenCalledWith({ where: { id: 'c-1' } });
    expect(steps).toEqual([
      'hold',
      'delete files',
      'delete files',
      'delete row',
    ]);
  });

  it('keeps a comment another server already took', async () => {
    prisma.comment.findMany.mockResolvedValueOnce([
      { moderatedAt: longAgo, ...comment('c-1', 'a', '/uploads/c.jpg') },
    ]);
    tx.$queryRaw.mockResolvedValueOnce([]);

    await service.eraseExpired(now);

    expect(uploads.deleteFilesOfErasedContent).not.toHaveBeenCalled();
    expect(tx.comment.delete).not.toHaveBeenCalled();
  });

  it('keeps the row when a file cannot be deleted, for the next night, and goes on with the others', async () => {
    const story = (id: string) => ({
      id,
      profileId: 'author',
      moderatedAt: longAgo,
      url: `/uploads/${id}.jpg`,
      standardUrl: null,
      thumbnailUrl: null,
      overlayUrl: null,
    });
    prisma.story.findMany.mockResolvedValueOnce([
      story('s-1'),
      story('s-2'),
      story('s-3'),
    ]);
    uploads.deleteFilesOfErasedContent
      .mockRejectedValueOnce(new Error('storage down'))
      .mockRejectedValueOnce('storage down');

    await service.eraseExpired(now);

    expect(tx.story.delete).toHaveBeenCalledTimes(1);
    expect(tx.story.delete).toHaveBeenCalledWith({ where: { id: 's-3' } });
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      'Removed story s-1 kept for the next night: storage down',
    );
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      'Removed story s-2 kept for the next night: storage down',
    );
    expect(Logger.prototype.log).toHaveBeenCalledWith(
      'Erased 1 removed stories whose time to appeal was over.',
    );
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

  it('never throws: a kind that cannot be read is logged and the others still run', async () => {
    prisma.post.findMany.mockRejectedValueOnce(new Error('db down'));

    await expect(service.eraseExpired(now)).resolves.toBeUndefined();
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      'Error erasing removed posts',
      expect.any(Error),
    );
    expect(prisma.story.findMany).toHaveBeenCalled();
    expect(prisma.comment.findMany).toHaveBeenCalled();
  });

  it('runs at the time of the night it is called with no date', async () => {
    await expect(service.eraseExpired()).resolves.toBeUndefined();
  });
});
