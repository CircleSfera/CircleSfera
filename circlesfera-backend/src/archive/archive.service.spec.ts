import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeKeysetCursor } from '../common/pagination/keyset.util.js';
import { SHOWN_COMMENTS_COUNT } from '../common/policies/removed-content.policy.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ARCHIVE_PAGE_MAX, ArchiveService } from './archive.service.js';

describe('ArchiveService', () => {
  const now = new Date('2026-11-23T10:00:00.000Z');
  const tx = {
    $queryRaw: vi.fn(),
    post: { update: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn(),
    post: { findMany: vi.fn() },
  };
  const service = new ArchiveService(prisma as unknown as PrismaService);
  const held = (over: Record<string, unknown> = {}) => [
    {
      profileId: 'me',
      deletedAt: null,
      archivedAt: null,
      moderationStatus: 'VISIBLE',
      ...over,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(
      async (run: (client: typeof tx) => unknown) => run(tx),
    );
    tx.post.update.mockResolvedValue({ id: 'p-1' });
  });

  describe('archive', () => {
    it('archives a post of the Profile, holding its row, and keeps everything else', async () => {
      tx.$queryRaw.mockResolvedValue(held());

      await expect(service.archive('me', 'p-1', now)).resolves.toEqual({
        id: 'p-1',
        archivedAt: now,
      });
      const [sql] = tx.$queryRaw.mock.calls[0];
      expect(sql.join('?')).toContain('FOR UPDATE');
      // Only when it was archived changes: its likes, comments and its
      // place on the profile are left as they are.
      expect(tx.post.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: { archivedAt: now },
        select: { id: true },
      });
    });

    it('archives with the time it is asked, when none is given', async () => {
      tx.$queryRaw.mockResolvedValue(held());
      const res = await service.archive('me', 'p-1');
      expect(res.archivedAt).toBeInstanceOf(Date);
    });

    it('leaves a post archived already as it was', async () => {
      const before = new Date('2026-11-01T00:00:00.000Z');
      tx.$queryRaw.mockResolvedValue(held({ archivedAt: before }));

      await expect(service.archive('me', 'p-1', now)).resolves.toEqual({
        id: 'p-1',
        archivedAt: before,
      });
      expect(tx.post.update).not.toHaveBeenCalled();
    });

    it("answers NotFound for a post that is missing, someone else's, deleted or removed", async () => {
      for (const rows of [
        [],
        held({ profileId: 'someone-else' }),
        held({ deletedAt: now }),
        held({ moderationStatus: 'REMOVED' }),
      ]) {
        tx.$queryRaw.mockResolvedValueOnce(rows);
        await expect(service.archive('me', 'p-1', now)).rejects.toThrow(
          NotFoundException,
        );
      }
      expect(tx.post.update).not.toHaveBeenCalled();
    });
  });

  describe('unarchive', () => {
    it('shows an archived post on the profile again', async () => {
      tx.$queryRaw.mockResolvedValue(held({ archivedAt: now }));

      await expect(service.unarchive('me', 'p-1')).resolves.toEqual({
        id: 'p-1',
      });
      expect(tx.post.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: { archivedAt: null },
        select: { id: true },
      });
    });

    it('leaves a post on the profile already as it was', async () => {
      tx.$queryRaw.mockResolvedValue(held());
      await expect(service.unarchive('me', 'p-1')).resolves.toEqual({
        id: 'p-1',
      });
      expect(tx.post.update).not.toHaveBeenCalled();
    });

    it("answers NotFound for a post that is someone else's, deleted or removed", async () => {
      for (const rows of [
        [],
        held({ profileId: 'someone-else', archivedAt: now }),
        held({ deletedAt: now, archivedAt: now }),
        held({ moderationStatus: 'REMOVED', archivedAt: now }),
      ]) {
        tx.$queryRaw.mockResolvedValueOnce(rows);
        await expect(service.unarchive('me', 'p-1')).rejects.toThrow(
          NotFoundException,
        );
      }
      expect(tx.post.update).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    const row = (id: string, archivedAt: Date, over = {}) => ({
      id,
      type: 'POST',
      caption: `caption ${id}`,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      archivedAt,
      media: [
        {
          url: `/uploads/${id}.jpg`,
          standardUrl: null,
          thumbnailUrl: `/uploads/${id}-t.jpg`,
          type: 'image',
          media: null,
        },
        {
          url: `/uploads/${id}-2.jpg`,
          standardUrl: null,
          thumbnailUrl: null,
          type: 'image',
          media: null,
        },
      ],
      _count: { likes: 7, comments: 3 },
      ...over,
    });

    it("lists the Profile's own archived posts, newest archived first, with their likes and comments", async () => {
      prisma.post.findMany.mockResolvedValue([row('p-2', now)]);

      const res = await service.list('me', 'POST');

      expect(prisma.post.findMany).toHaveBeenCalledWith({
        where: {
          profileId: 'me',
          type: 'POST',
          archivedAt: { not: null },
          deletedAt: null,
          moderationStatus: { not: 'REMOVED' },
        },
        orderBy: [{ archivedAt: 'desc' }, { id: 'desc' }],
        take: 25,
        select: expect.objectContaining({
          _count: { select: { likes: true, comments: SHOWN_COMMENTS_COUNT } },
        }),
      });
      expect(res).toEqual({
        items: [
          {
            kind: 'POST',
            id: 'p-2',
            createdAt: new Date('2026-10-01T00:00:00.000Z'),
            archivedAt: now,
            caption: 'caption p-2',
            mediaType: 'image',
            url: '/uploads/p-2.jpg',
            standardUrl: null,
            thumbnailUrl: '/uploads/p-2-t.jpg',
            mediaCount: 2,
            likesCount: 7,
            commentsCount: 3,
          },
        ],
        nextCursor: null,
      });
    });

    it('pages by when each was archived, and a next page starts after the last one', async () => {
      const earlier = new Date('2026-11-20T00:00:00.000Z');
      prisma.post.findMany.mockResolvedValueOnce([
        row('p-3', now),
        row('p-2', earlier),
        row('p-1', earlier),
      ]);

      const first = await service.list('me', 'POST', undefined, 2);
      expect(first.items.map((item) => item.id)).toEqual(['p-3', 'p-2']);
      expect(first.nextCursor).not.toBeNull();
      expect(decodeKeysetCursor(first.nextCursor as string)).toEqual({
        createdAt: earlier,
        id: 'p-2',
      });

      prisma.post.findMany.mockResolvedValueOnce([row('p-1', earlier)]);
      const second = await service.list(
        'me',
        'POST',
        first.nextCursor as string,
        2,
      );
      expect(prisma.post.findMany.mock.calls[1][0].where).toMatchObject({
        OR: [
          { archivedAt: { lt: earlier } },
          { archivedAt: earlier, id: { lt: 'p-2' } },
        ],
      });
      expect(second).toMatchObject({ nextCursor: null });
    });

    it('lists frames apart, a video as a video, and a post with no picture as a plain tile', async () => {
      prisma.post.findMany.mockResolvedValue([
        row('f-1', now, {
          type: 'FRAME',
          media: [
            {
              url: '/uploads/f-1.mp4',
              standardUrl: '/uploads/f-1.m3u8',
              thumbnailUrl: null,
              type: 'video',
              media: null,
            },
          ],
        }),
        row('f-2', now, { type: 'FRAME', media: [] }),
        // The filter never reads one with no archive time; it is skipped.
        row('f-3', null as unknown as Date, { type: 'FRAME' }),
      ]);

      const res = await service.list('me', 'FRAME');

      expect(prisma.post.findMany.mock.calls[0][0].where.type).toBe('FRAME');
      expect(res.items).toEqual([
        expect.objectContaining({
          kind: 'FRAME',
          id: 'f-1',
          mediaType: 'video',
          url: '/uploads/f-1.mp4',
          standardUrl: '/uploads/f-1.m3u8',
          mediaCount: 1,
        }),
        expect.objectContaining({
          kind: 'FRAME',
          id: 'f-2',
          mediaType: 'image',
          url: '',
          standardUrl: null,
          thumbnailUrl: null,
          mediaCount: 0,
        }),
      ]);
    });

    it('keeps the page size within its bounds, and a malformed cursor starts from the top', async () => {
      prisma.post.findMany.mockResolvedValue([]);

      await service.list('me', 'POST', 'not-a-cursor', 1000);
      expect(prisma.post.findMany.mock.calls[0][0].take).toBe(
        ARCHIVE_PAGE_MAX + 1,
      );
      expect(prisma.post.findMany.mock.calls[0][0].where.OR).toBeUndefined();

      await service.list('me', 'POST', undefined, 0);
      expect(prisma.post.findMany.mock.calls[1][0].take).toBe(2);
    });

    it('answers no next page when the last row has no archive time', async () => {
      prisma.post.findMany.mockResolvedValue([
        row('p-2', null as unknown as Date),
        row('p-1', now),
      ]);
      const res = await service.list('me', 'POST', undefined, 1);
      expect(res).toEqual({ items: [], nextCursor: null });
    });
  });
});
