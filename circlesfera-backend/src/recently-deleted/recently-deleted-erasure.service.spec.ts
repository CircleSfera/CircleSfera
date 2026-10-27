import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { UploadsService } from '../uploads/uploads.service.js';
import { ERASE_TRANSACTION } from './recently-deleted.service.js';
import {
  RECENTLY_DELETED_BATCH_SIZE,
  RECENTLY_DELETED_MAX_BATCHES,
  RecentlyDeletedErasureService,
} from './recently-deleted-erasure.service.js';

const DAY = 24 * 60 * 60 * 1000;

describe('RecentlyDeletedErasureService', () => {
  const now = new Date('2026-12-31T01:00:00Z');
  const deletedAt = new Date(now.getTime() - 31 * DAY);

  const tx = {
    $queryRaw: vi.fn(),
    postMedia: { findMany: vi.fn() },
    comment: { findMany: vi.fn() },
    post: { delete: vi.fn() },
    story: { delete: vi.fn() },
  };
  const prisma = {
    post: { findMany: vi.fn() },
    story: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  const uploads = { deleteFilesOfErasedContent: vi.fn() };
  const service = new RecentlyDeletedErasureService(
    prisma as unknown as PrismaService,
    uploads as unknown as UploadsService,
  );
  const post = (id: string) => ({ id, profileId: 'author', deletedAt });
  const story = (id: string) => ({
    id,
    profileId: 'author',
    deletedAt,
    url: `/uploads/${id}.jpg`,
    standardUrl: null,
    thumbnailUrl: null,
    overlayUrl: null,
  });
  const steps: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    steps.length = 0;
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma.post.findMany.mockResolvedValue([]);
    prisma.story.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(
      async (run: (client: typeof tx) => unknown) => run(tx),
    );
    tx.$queryRaw.mockImplementation(async () => {
      steps.push('hold');
      return [{ deletedAt, moderationStatus: 'VISIBLE' }];
    });
    tx.postMedia.findMany.mockResolvedValue([
      {
        id: 'm-1',
        url: '/uploads/p.jpg',
        standardUrl: null,
        thumbnailUrl: null,
      },
    ]);
    tx.comment.findMany.mockResolvedValue([]);
    for (const model of [tx.post, tx.story]) {
      model.delete.mockImplementation(async () => {
        steps.push('row');
        return {};
      });
    }
    uploads.deleteFilesOfErasedContent.mockImplementation(async () => {
      steps.push('files');
      return [];
    });
  });

  it('erases the posts and stories deleted more than 30 days ago: files, then rows, each holding its row', async () => {
    prisma.post.findMany.mockResolvedValueOnce([post('p-1')]);
    prisma.story.findMany.mockResolvedValueOnce([story('s-1')]);

    await service.eraseExpired(now);

    const cutoff = new Date(now.getTime() - 30 * DAY);
    for (const read of [prisma.post.findMany, prisma.story.findMany]) {
      expect(read.mock.calls[0][0]).toMatchObject({
        where: {
          deletedAt: { lt: cutoff },
          moderationStatus: { not: 'REMOVED' },
        },
        orderBy: { id: 'asc' },
        take: RECENTLY_DELETED_BATCH_SIZE,
      });
    }
    expect(steps).toEqual(['hold', 'files', 'row', 'hold', 'files', 'row']);
    expect(tx.$queryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
    expect(tx.post.delete).toHaveBeenCalledWith({ where: { id: 'p-1' } });
    expect(tx.story.delete).toHaveBeenCalledWith({ where: { id: 's-1' } });
    expect(uploads.deleteFilesOfErasedContent).toHaveBeenCalledWith(
      'author',
      ['/uploads/s-1.jpg', null, null, null],
      { story: ['s-1'] },
    );
    expect(prisma.$transaction.mock.calls[0][1]).toEqual(ERASE_TRANSACTION);
    expect(Logger.prototype.log).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      'was restored meanwhile',
      [{ deletedAt: null, moderationStatus: 'VISIBLE' }],
    ],
    [
      'was restored and deleted again since',
      [{ deletedAt: new Date(), moderationStatus: 'VISIBLE' }],
    ],
    [
      'was removed by moderation since',
      [{ deletedAt, moderationStatus: 'REMOVED' }],
    ],
    ['was erased by another server', []],
  ])('leaves a row that %s', async (_label, held) => {
    prisma.post.findMany.mockResolvedValueOnce([post('p-1')]);
    prisma.story.findMany.mockResolvedValueOnce([story('s-1')]);
    tx.$queryRaw.mockResolvedValue(held);

    await service.eraseExpired(now);

    expect(tx.post.delete).not.toHaveBeenCalled();
    expect(tx.story.delete).not.toHaveBeenCalled();
    expect(uploads.deleteFilesOfErasedContent).not.toHaveBeenCalled();
    expect(Logger.prototype.log).not.toHaveBeenCalled();
  });

  it('keeps a row whose files cannot be deleted for the next night, and goes on with the others', async () => {
    prisma.post.findMany.mockResolvedValueOnce([post('p-1'), post('p-2')]);
    uploads.deleteFilesOfErasedContent
      .mockRejectedValueOnce(new Error('disk'))
      .mockRejectedValueOnce('not an error')
      .mockResolvedValue([]);

    await service.eraseExpired(now);

    expect(tx.post.delete).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.stringContaining('p-1 kept for the next night: disk'),
    );
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.stringContaining('p-2 kept for the next night: not an error'),
    );
  });

  it("goes through full pages after the last id, up to the night's limit", async () => {
    const page = Array.from({ length: RECENTLY_DELETED_BATCH_SIZE }, (_, i) =>
      post(`p-${String(i).padStart(3, '0')}`),
    );
    prisma.post.findMany.mockResolvedValue(page);

    await service.eraseExpired(now);

    expect(prisma.post.findMany).toHaveBeenCalledTimes(
      RECENTLY_DELETED_MAX_BATCHES,
    );
    expect(prisma.post.findMany.mock.calls[1][0].where.id).toEqual({
      gt: page[page.length - 1].id,
    });
  });

  it('never throws: a kind that fails is logged and the other still runs', async () => {
    prisma.post.findMany.mockRejectedValueOnce(new Error('db down'));
    prisma.story.findMany.mockResolvedValueOnce([story('s-1')]);

    await expect(service.eraseExpired(now)).resolves.toBeUndefined();

    expect(Logger.prototype.error).toHaveBeenCalledWith(
      'Error erasing deleted posts',
      expect.any(Error),
    );
    expect(tx.story.delete).toHaveBeenCalled();
  });

  it('reads the time now when none is given', async () => {
    await expect(service.eraseExpired()).resolves.toBeUndefined();
    expect(prisma.post.findMany).toHaveBeenCalled();
  });
});
