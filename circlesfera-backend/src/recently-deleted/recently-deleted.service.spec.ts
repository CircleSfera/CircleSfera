import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StoredFilesService } from '../uploads/services/stored-files.service.js';
import type { UploadsService } from '../uploads/uploads.service.js';
import {
  ERASE_TRANSACTION,
  RECENTLY_DELETED_LIST_LIMIT,
  RecentlyDeletedService,
  recentlyDeletedCutoff,
} from './recently-deleted.service.js';

const DAY = 24 * 60 * 60 * 1000;

describe('RecentlyDeletedService', () => {
  const now = new Date('2026-11-30T12:00:00Z');
  const daysAgo = (days: number) => new Date(now.getTime() - days * DAY);

  const tx = {
    $queryRaw: vi.fn(),
    post: { update: vi.fn(), delete: vi.fn() },
    story: { update: vi.fn(), delete: vi.fn(), findUniqueOrThrow: vi.fn() },
    postMedia: { findMany: vi.fn() },
    comment: { findMany: vi.fn() },
  };
  const prisma = {
    post: { findMany: vi.fn() },
    story: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  const storedFiles = { reattach: vi.fn() };
  const uploads = { deleteFilesOfErasedContent: vi.fn() };
  const service = new RecentlyDeletedService(
    prisma as unknown as PrismaService,
    storedFiles as unknown as StoredFilesService,
    uploads as unknown as UploadsService,
  );
  const held = (
    deletedAt: Date | null = daysAgo(2),
    profileId = 'me',
    moderationStatus = 'VISIBLE',
  ) => [{ profileId, deletedAt, moderationStatus }];

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (run: (client: typeof tx) => unknown) => run(tx),
    );
    prisma.post.findMany.mockResolvedValue([]);
    prisma.story.findMany.mockResolvedValue([]);
    tx.$queryRaw.mockResolvedValue(held());
    tx.postMedia.findMany.mockResolvedValue([]);
    tx.comment.findMany.mockResolvedValue([]);
    uploads.deleteFilesOfErasedContent.mockResolvedValue([]);
  });

  describe('list', () => {
    it('lists the posts, frames and stories deleted in the last 30 days, newest deleted first, with the days left', async () => {
      prisma.post.findMany.mockResolvedValue([
        {
          id: 'post-1',
          type: 'POST',
          caption: 'Beach',
          createdAt: daysAgo(40),
          deletedAt: daysAgo(29.5),
          media: [
            {
              url: '/uploads/a.jpg',
              standardUrl: '/uploads/a-std.jpg',
              thumbnailUrl: '/uploads/a-th.jpg',
              type: 'image',
              media: null,
            },
            {
              url: '/uploads/b.jpg',
              standardUrl: null,
              thumbnailUrl: null,
              type: 'image',
              media: null,
            },
          ],
        },
        {
          id: 'frame-1',
          type: 'FRAME',
          caption: null,
          createdAt: daysAgo(10),
          deletedAt: daysAgo(1),
          media: [
            {
              url: '/uploads/v.mp4',
              standardUrl: null,
              thumbnailUrl: null,
              type: 'video',
              // A processed video answers its stream and cover.
              media: {
                url: '/uploads/v/master.m3u8',
                standardUrl: null,
                thumbnailUrl: '/uploads/v/cover.jpg',
                status: 'READY',
              },
            },
          ],
        },
        // A post with no media left is not listed.
        {
          id: 'empty',
          type: 'POST',
          caption: null,
          createdAt: daysAgo(5),
          deletedAt: daysAgo(3),
          media: [],
        },
      ]);
      prisma.story.findMany.mockResolvedValue([
        {
          id: 'story-1',
          createdAt: daysAgo(6),
          deletedAt: daysAgo(5),
          url: '/uploads/s.mp4',
          standardUrl: null,
          thumbnailUrl: '/uploads/s-th.jpg',
          mediaType: 'video',
          media: null,
        },
      ]);

      const { items } = await service.list('me', now);

      expect(items.map((item) => [item.kind, item.id, item.daysLeft])).toEqual([
        ['FRAME', 'frame-1', 29],
        ['STORY', 'story-1', 25],
        ['POST', 'post-1', 1],
      ]);
      expect(items[0]).toMatchObject({
        mediaType: 'video',
        url: '/uploads/v/master.m3u8',
        thumbnailUrl: '/uploads/v/cover.jpg',
        mediaCount: 1,
      });
      expect(items[2]).toMatchObject({
        caption: 'Beach',
        mediaType: 'image',
        url: '/uploads/a.jpg',
        standardUrl: '/uploads/a-std.jpg',
        mediaCount: 2,
      });
      expect(items[1]).toMatchObject({ caption: null, mediaCount: 1 });

      // Only the Profile's own, within the 30 days, and never what
      // moderation removed: that is kept for its appeal, out of reach.
      const where = {
        profileId: 'me',
        deletedAt: { gte: recentlyDeletedCutoff(now) },
        moderationStatus: { not: 'REMOVED' },
      };
      for (const query of [prisma.post.findMany, prisma.story.findMany]) {
        expect(query).toHaveBeenCalledWith(
          expect.objectContaining({
            where,
            orderBy: { deletedAt: 'desc' },
            take: RECENTLY_DELETED_LIST_LIMIT,
          }),
        );
      }
      expect(recentlyDeletedCutoff(now)).toEqual(daysAgo(30));
    });

    it('shows no days left once the 30 days are over, and an image story as an image', async () => {
      prisma.story.findMany.mockResolvedValue([
        {
          id: 'story-old',
          createdAt: daysAgo(31),
          deletedAt: daysAgo(30),
          url: '/uploads/s.jpg',
          standardUrl: null,
          thumbnailUrl: null,
          mediaType: 'image',
          media: null,
        },
        // Read with no deletion time: never listed.
        { id: 'story-x', deletedAt: null, mediaType: 'image', media: null },
      ]);
      prisma.post.findMany.mockResolvedValue([
        {
          id: 'post-x',
          type: 'POST',
          deletedAt: null,
          media: [{ url: '/uploads/x.jpg', type: 'image', media: null }],
        },
      ]);

      const { items } = await service.list('me', now);

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        id: 'story-old',
        daysLeft: 0,
        mediaType: 'image',
      });
    });

    it('reads the time now when none is given', async () => {
      await expect(service.list('me')).resolves.toEqual({ items: [] });
    });
  });

  describe('restorePost', () => {
    it('puts the post back as it was and opens its files again, in one transaction that holds its row', async () => {
      tx.post.update.mockResolvedValue({
        type: 'FRAME',
        media: [
          {
            url: '/uploads/v.mp4',
            standardUrl: null,
            thumbnailUrl: '/uploads/v-th.jpg',
          },
        ],
      });

      await expect(service.restorePost('me', 'post-1', now)).resolves.toEqual({
        id: 'post-1',
        kind: 'FRAME',
      });

      const [sql, id] = tx.$queryRaw.mock.calls[0];
      expect(sql.join('?')).toContain('FOR UPDATE');
      expect(id).toBe('post-1');
      expect(tx.post.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'post-1' },
          data: { deletedAt: null },
        }),
      );
      expect(storedFiles.reattach).toHaveBeenCalledWith(
        ['/uploads/v.mp4', null, '/uploads/v-th.jpg'],
        tx,
      );
      expect(prisma.$transaction.mock.calls[0][1]).toEqual({
        timeout: 30_000,
        maxWait: 5_000,
      });
    });

    it('answers a post as a post, reading the time now when none is given', async () => {
      tx.$queryRaw.mockResolvedValue(held(new Date()));
      tx.post.update.mockResolvedValue({ type: 'POST', media: [] });
      await expect(service.restorePost('me', 'post-1')).resolves.toEqual({
        id: 'post-1',
        kind: 'POST',
      });
    });

    it.each([
      ['missing', []],
      ['of another Profile', held(daysAgo(2), 'someone-else')],
      ['not deleted', held(null)],
      ['removed by moderation', held(daysAgo(2), 'me', 'REMOVED')],
      ['past its 30 days', held(daysAgo(31))],
    ])(
      'answers not found for a post %s, and changes nothing',
      async (_label, row) => {
        tx.$queryRaw.mockResolvedValue(row);
        await expect(service.restorePost('me', 'post-1', now)).rejects.toThrow(
          NotFoundException,
        );
        expect(tx.post.update).not.toHaveBeenCalled();
        expect(storedFiles.reattach).not.toHaveBeenCalled();
      },
    );
  });

  describe('restoreStory', () => {
    const files = {
      url: '/uploads/s.jpg',
      standardUrl: '/uploads/s-std.jpg',
      thumbnailUrl: null,
      overlayUrl: '/uploads/s-layer.png',
    };

    it('puts a story still within its 24 hours back in the tray', async () => {
      tx.story.update.mockResolvedValue({
        expiresAt: new Date(now.getTime() + DAY / 2),
        ...files,
      });

      await expect(service.restoreStory('me', 'story-1', now)).resolves.toEqual(
        { id: 'story-1', archived: false },
      );
      expect(tx.story.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'story-1' },
          data: { deletedAt: null },
        }),
      );
      expect(storedFiles.reattach).toHaveBeenCalledWith(
        ['/uploads/s.jpg', '/uploads/s-std.jpg', null, '/uploads/s-layer.png'],
        tx,
      );
    });

    it('puts a story whose 24 hours are over back in the archive only', async () => {
      tx.story.update.mockResolvedValue({ expiresAt: daysAgo(1), ...files });
      await expect(service.restoreStory('me', 'story-1', now)).resolves.toEqual(
        {
          id: 'story-1',
          archived: true,
        },
      );
    });

    it('reads the time now when none is given', async () => {
      tx.$queryRaw.mockResolvedValue(held(new Date()));
      tx.story.update.mockResolvedValue({
        expiresAt: new Date(Date.now() - DAY),
        ...files,
      });
      await expect(service.restoreStory('me', 'story-1')).resolves.toEqual({
        id: 'story-1',
        archived: true,
      });
    });

    it('answers not found for a story of another Profile', async () => {
      tx.$queryRaw.mockResolvedValue(held(daysAgo(1), 'someone-else'));
      await expect(service.restoreStory('me', 'story-1', now)).rejects.toThrow(
        'Story not found',
      );
      expect(tx.story.update).not.toHaveBeenCalled();
    });
  });

  describe('erasePost', () => {
    it("deletes the files first, the author's and each commenter's own, then the row, holding it", async () => {
      const steps: string[] = [];
      tx.$queryRaw.mockImplementation(async () => {
        steps.push('hold');
        return held();
      });
      tx.postMedia.findMany.mockResolvedValue([
        {
          id: 'm-1',
          url: '/uploads/a.jpg',
          standardUrl: null,
          thumbnailUrl: null,
        },
      ]);
      tx.comment.findMany.mockResolvedValue([
        {
          id: 'c-1',
          profileId: 'friend',
          url: null,
          standardUrl: null,
          thumbnailUrl: null,
          voiceUrl: '/uploads/voice.m4a',
        },
      ]);
      uploads.deleteFilesOfErasedContent.mockImplementation(async () => {
        steps.push('files');
        return [];
      });
      tx.post.delete.mockImplementation(async () => {
        steps.push('row');
        return {};
      });

      await service.erasePost('me', 'post-1');

      expect(steps).toEqual(['hold', 'files', 'files', 'row']);
      const ignoring = { postMedia: ['m-1'], comment: ['c-1'] };
      expect(uploads.deleteFilesOfErasedContent).toHaveBeenCalledWith(
        'me',
        ['/uploads/a.jpg', null, null],
        ignoring,
      );
      expect(uploads.deleteFilesOfErasedContent).toHaveBeenCalledWith(
        'friend',
        [null, null, null, '/uploads/voice.m4a'],
        ignoring,
      );
      expect(tx.post.delete).toHaveBeenCalledWith({ where: { id: 'post-1' } });
      expect(prisma.$transaction.mock.calls[0][1]).toEqual(ERASE_TRANSACTION);
    });

    it('erases a deletion past its 30 days too, which the nightly erasure has not reached yet', async () => {
      tx.$queryRaw.mockResolvedValue(held(daysAgo(40)));
      await service.erasePost('me', 'post-1');
      expect(tx.post.delete).toHaveBeenCalled();
    });

    it('keeps the post when a file cannot be deleted', async () => {
      tx.postMedia.findMany.mockResolvedValue([
        {
          id: 'm-1',
          url: '/uploads/a.jpg',
          standardUrl: null,
          thumbnailUrl: null,
        },
      ]);
      uploads.deleteFilesOfErasedContent.mockRejectedValue(new Error('disk'));
      await expect(service.erasePost('me', 'post-1')).rejects.toThrow('disk');
      expect(tx.post.delete).not.toHaveBeenCalled();
    });

    it.each([
      ['not deleted', held(null)],
      ['of another Profile', held(daysAgo(1), 'someone-else')],
      ['removed by moderation', held(daysAgo(1), 'me', 'REMOVED')],
    ])(
      'answers not found for a post %s, and erases nothing',
      async (_label, row) => {
        tx.$queryRaw.mockResolvedValue(row);
        await expect(service.erasePost('me', 'post-1')).rejects.toThrow(
          'Post not found',
        );
        expect(tx.post.delete).not.toHaveBeenCalled();
        expect(uploads.deleteFilesOfErasedContent).not.toHaveBeenCalled();
      },
    );
  });

  describe('eraseStory', () => {
    it('deletes its files, then the row', async () => {
      tx.story.findUniqueOrThrow.mockResolvedValue({
        url: '/uploads/s.jpg',
        standardUrl: null,
        thumbnailUrl: null,
        overlayUrl: null,
      });

      await service.eraseStory('me', 'story-1');

      expect(uploads.deleteFilesOfErasedContent).toHaveBeenCalledWith(
        'me',
        ['/uploads/s.jpg', null, null, null],
        { story: ['story-1'] },
      );
      expect(tx.story.delete).toHaveBeenCalledWith({
        where: { id: 'story-1' },
      });
    });

    it('answers not found for a story that is not in Recently deleted', async () => {
      tx.$queryRaw.mockResolvedValue([]);
      await expect(service.eraseStory('me', 'story-1')).rejects.toThrow(
        'Story not found',
      );
      expect(tx.story.delete).not.toHaveBeenCalled();
    });
  });
});
