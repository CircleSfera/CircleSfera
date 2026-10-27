import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ERASE_TRANSACTION } from '../recently-deleted/recently-deleted.service.js';
import type { UploadsService } from '../uploads/uploads.service.js';
import {
  STORY_ARCHIVE_BATCH_SIZE,
  STORY_ARCHIVE_MAX_BATCHES,
  StoryArchiveErasureService,
} from './story-archive-erasure.service.js';

describe('StoryArchiveErasureService', () => {
  const now = new Date('2026-11-24T04:00:00.000Z');
  const tx = {
    $queryRaw: vi.fn(),
    highlightStory: { count: vi.fn() },
    story: { delete: vi.fn() },
  };
  const prisma = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  const uploads = { deleteFilesOfErasedContent: vi.fn() };
  const service = new StoryArchiveErasureService(
    prisma as unknown as PrismaService,
    uploads as unknown as UploadsService,
  );
  const story = (id: string) => ({
    id,
    profileId: 'author',
    url: `/uploads/${id}.jpg`,
    standardUrl: null,
    thumbnailUrl: `/uploads/${id}-t.jpg`,
    overlayUrl: null,
  });
  const steps: string[] = [];
  const sqlOf = (call: unknown[]) => (call[0] as string[]).join('?');

  beforeEach(() => {
    vi.clearAllMocks();
    steps.length = 0;
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(
      async (run: (client: typeof tx) => unknown) => run(tx),
    );
    tx.$queryRaw.mockImplementation(async (_sql: unknown, id: string) => {
      steps.push('hold');
      return [{ id }];
    });
    tx.highlightStory.count.mockResolvedValue(0);
    tx.story.delete.mockImplementation(async () => {
      steps.push('row');
      return {};
    });
    uploads.deleteFilesOfErasedContent.mockImplementation(async () => {
      steps.push('files');
      return [];
    });
  });

  it('reads only stories that ended after their Profile stopped saving them, in no highlight', async () => {
    await service.eraseUnkept(now);

    const sql = sqlOf(prisma.$queryRaw.mock.calls[0]);
    expect(sql).toContain('p."saveStoriesToArchive" = false');
    expect(sql).toContain('s."expiresAt" < ?');
    // What the archive held before it was turned off stays.
    expect(sql).toContain('s."expiresAt" > p."storyArchiveOffAt"');
    // Recently deleted and moderation keep theirs on their own terms.
    expect(sql).toContain('s."deletedAt" IS NULL');
    expect(sql).toContain(`s."moderationStatus" <> 'REMOVED'`);
    expect(sql).toContain('"highlight_stories"');
    expect(prisma.$queryRaw.mock.calls[0][1]).toBe(now);
    expect(tx.story.delete).not.toHaveBeenCalled();
  });

  it("erases each one as its author's own deletion would: files first, then the row", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([story('s-1')]);

    await service.eraseUnkept(now);

    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      ERASE_TRANSACTION,
    );
    const held = sqlOf(tx.$queryRaw.mock.calls[0]);
    expect(held).toContain('FOR UPDATE OF s FOR SHARE OF p');
    expect(held).toContain('p."saveStoriesToArchive" = false');
    expect(held).toContain('s."expiresAt" > p."storyArchiveOffAt"');
    expect(tx.highlightStory.count).toHaveBeenCalledWith({
      where: { storyId: 's-1' },
    });
    expect(uploads.deleteFilesOfErasedContent).toHaveBeenCalledWith(
      'author',
      ['/uploads/s-1.jpg', null, '/uploads/s-1-t.jpg', null],
      { story: ['s-1'] },
    );
    expect(tx.story.delete).toHaveBeenCalledWith({ where: { id: 's-1' } });
    expect(steps).toEqual(['hold', 'files', 'row']);
    expect(Logger.prototype.log).toHaveBeenCalledWith(
      'Erased 1 ended stories not kept in their archive.',
    );
  });

  it('keeps a story whose Profile saves stories again, or that was deleted or erased meanwhile', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([story('s-1')]);
    tx.$queryRaw.mockResolvedValueOnce([]);

    await service.eraseUnkept(now);

    expect(tx.highlightStory.count).not.toHaveBeenCalled();
    expect(tx.story.delete).not.toHaveBeenCalled();
    expect(Logger.prototype.log).not.toHaveBeenCalled();
  });

  it('keeps a story added to a highlight just before', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([story('s-1')]);
    tx.highlightStory.count.mockResolvedValueOnce(1);

    await service.eraseUnkept(now);

    expect(uploads.deleteFilesOfErasedContent).not.toHaveBeenCalled();
    expect(tx.story.delete).not.toHaveBeenCalled();
  });

  it('keeps a story whose file cannot be deleted for the next night, and goes on', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([story('s-1'), story('s-2')]);
    uploads.deleteFilesOfErasedContent
      .mockRejectedValueOnce(new Error('storage down'))
      .mockRejectedValueOnce('not an error');

    await service.eraseUnkept(now);

    expect(tx.story.delete).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      'Ended story s-1 kept for the next night: storage down',
    );
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      'Ended story s-2 kept for the next night: not an error',
    );
  });

  it('goes through full batches after the last id, up to its most a night', async () => {
    const full = (prefix: string) =>
      Array.from({ length: STORY_ARCHIVE_BATCH_SIZE }, (_v, i) =>
        story(`${prefix}-${String(i).padStart(3, '0')}`),
      );
    prisma.$queryRaw.mockResolvedValueOnce(full('a'));
    prisma.$queryRaw.mockResolvedValueOnce([story('b-000')]);

    await service.eraseUnkept(now);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.$queryRaw.mock.calls[0]).toContain('');
    expect(prisma.$queryRaw.mock.calls[1]).toContain('a-099');
    expect(tx.story.delete).toHaveBeenCalledTimes(STORY_ARCHIVE_BATCH_SIZE + 1);

    vi.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue(full('c'));
    tx.$queryRaw.mockResolvedValue([]);
    await service.eraseUnkept(now);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(STORY_ARCHIVE_MAX_BATCHES);
  });

  it('never throws', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('db down'));
    await expect(service.eraseUnkept(now)).resolves.toBeUndefined();
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      'Error erasing ended stories not kept',
      expect.any(Error),
    );
  });

  it('runs with the current time when none is given', async () => {
    await service.eraseUnkept();
    expect(prisma.$queryRaw.mock.calls[0][1]).toBeInstanceOf(Date);
  });
});
