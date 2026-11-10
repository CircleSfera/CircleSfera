import { FIRST_PAID_ITEMS_REVIEWED_BY_STAFF } from '@circlesfera/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminFirstPaidReviewService } from './admin-first-paid-review.service.js';

const WAITING = {
  priceCents: { gt: 0 },
  moderationStatus: 'VISIBLE',
  moderationPassedAt: null,
  deletedAt: null,
};

const profile = (id: string) => ({ id, username: id, avatar: null });
const brief = (id: string, profileId: string, day: number) => ({
  id,
  profileId,
  createdAt: new Date(`2026-11-0${day}T10:00:00.000Z`),
});

describe('AdminFirstPaidReviewService', () => {
  let prisma: any;
  let audit: { execute: ReturnType<typeof vi.fn> };
  let service: AdminFirstPaidReviewService;

  const model = () => ({
    findMany: vi.fn().mockResolvedValue([]),
    groupBy: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    count: vi.fn().mockResolvedValue(0),
  });

  beforeEach(() => {
    prisma = { post: model(), story: model() };
    prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma));
    audit = { execute: vi.fn().mockResolvedValue(undefined) };
    service = new AdminFirstPaidReviewService(prisma, audit as any);
  });

  describe('list', () => {
    it('shows every priced item waiting, oldest first, with all its media and how many a person passed', async () => {
      prisma.post.findMany
        .mockResolvedValueOnce([brief('post-2', 'ana', 3)])
        .mockResolvedValueOnce([
          {
            id: 'post-2',
            caption: 'Second',
            priceCents: 500,
            createdAt: new Date('2026-11-03T10:00:00.000Z'),
            contentEditedAt: null,
            profile: profile('ana'),
            media: [
              { url: 'a.jpg', thumbnailUrl: null, type: 'image' },
              { url: 'b.mp4', thumbnailUrl: 'b.jpg', type: 'video' },
            ],
          },
        ]);
      prisma.story.findMany
        .mockResolvedValueOnce([brief('story-1', 'ana', 1)])
        .mockResolvedValueOnce([
          {
            id: 'story-1',
            priceCents: 300,
            createdAt: new Date('2026-11-01T10:00:00.000Z'),
            url: 's.mp4',
            thumbnailUrl: 's.jpg',
            mediaType: 'video',
            profile: profile('ana'),
          },
        ]);
      prisma.post.groupBy.mockResolvedValue([{ profileId: 'ana', _count: 1 }]);

      const res = await service.list();

      expect(prisma.post.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: WAITING,
          orderBy: { createdAt: 'asc' },
        }),
      );
      expect(prisma.post.groupBy).toHaveBeenCalledWith({
        by: ['profileId'],
        where: {
          profileId: { in: ['ana'] },
          priceCents: { gt: 0 },
          moderationPassedByStaff: true,
        },
        _count: true,
      });
      // The full post, its media in the order its author put them.
      expect(prisma.post.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { id: { in: ['post-2'] } },
          select: expect.objectContaining({
            media: expect.objectContaining({ orderBy: { order: 'asc' } }),
          }),
        }),
      );
      expect(res.needed).toBe(FIRST_PAID_ITEMS_REVIEWED_BY_STAFF);
      expect(res.items.map((i) => i.id)).toEqual(['story-1', 'post-2']);
      expect(res.items[0]).toMatchObject({
        type: 'STORY',
        caption: null,
        contentEditedAt: null,
        passedByStaff: 1,
        media: [{ url: 's.mp4', thumbnailUrl: 's.jpg', type: 'video' }],
      });
      expect(res.items[1].media).toHaveLength(2);
    });

    it('never lets Profiles a person passed enough of hide a new creator', async () => {
      prisma.post.findMany
        .mockResolvedValueOnce([
          brief('old-1', 'trusted', 1),
          brief('new-1', 'newcomer', 2),
        ])
        .mockResolvedValueOnce([
          {
            id: 'new-1',
            caption: null,
            priceCents: 500,
            createdAt: new Date('2026-11-02T10:00:00.000Z'),
            contentEditedAt: null,
            profile: profile('newcomer'),
            media: [],
          },
        ]);
      prisma.post.groupBy.mockResolvedValue([
        {
          profileId: 'trusted',
          _count: FIRST_PAID_ITEMS_REVIEWED_BY_STAFF - 1,
        },
      ]);
      prisma.story.groupBy.mockResolvedValue([
        { profileId: 'trusted', _count: 1 },
      ]);

      const res = await service.list();

      expect(prisma.post.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { id: { in: ['new-1'] } } }),
      );
      expect(res.items.map((i) => i.id)).toEqual(['new-1']);
      expect(res.items[0].passedByStaff).toBe(0);
    });

    it('leaves out an item gone between the two reads', async () => {
      prisma.post.findMany
        .mockResolvedValueOnce([brief('post-1', 'ana', 1)])
        .mockResolvedValueOnce([]);

      expect((await service.list()).items).toEqual([]);
    });
  });

  describe('approve', () => {
    it('puts a waiting post on sale only as it was when staff opened it, in the audit log', async () => {
      await expect(
        service.approve('admin-1', 'POST', 'p-1', '2026-11-05T10:00:00.000Z'),
      ).resolves.toEqual({ approved: true });

      expect(prisma.post.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'p-1',
          ...WAITING,
          contentEditedAt: new Date('2026-11-05T10:00:00.000Z'),
        },
        data: {
          moderationPassedAt: expect.any(Date),
          moderationPassedByStaff: true,
        },
      });
      expect(audit.execute).toHaveBeenCalledWith(
        'admin-1',
        'PAID_CONTENT_APPROVED',
        'post',
        'p-1',
        undefined,
        undefined,
        prisma,
      );
    });

    it('passes a post never edited, and a story', async () => {
      await service.approve('admin-1', 'POST', 'p-1');
      expect(prisma.post.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ contentEditedAt: null }),
        }),
      );

      await service.approve('admin-1', 'STORY', 's-1');
      expect(prisma.story.updateMany).toHaveBeenCalledWith({
        where: { id: 's-1', ...WAITING },
        data: {
          moderationPassedAt: expect.any(Date),
          moderationPassedByStaff: true,
        },
      });
      expect(audit.execute).toHaveBeenLastCalledWith(
        'admin-1',
        'PAID_CONTENT_APPROVED',
        'story',
        's-1',
        undefined,
        undefined,
        prisma,
      );
    });

    it('refuses a post its author edited since it was opened, to be looked at again', async () => {
      prisma.post.updateMany.mockResolvedValue({ count: 0 });
      prisma.post.count.mockResolvedValue(1);

      await expect(
        service.approve('admin-1', 'POST', 'p-1', null),
      ).rejects.toMatchObject({ errorCode: 'CONTENT_CHANGED_SINCE_REVIEW' });
      expect(prisma.post.count).toHaveBeenCalledWith({
        where: { id: 'p-1', ...WAITING },
      });
      expect(audit.execute).not.toHaveBeenCalled();
    });

    it.each([
      ['POST', 'post', 'POST_NOT_FOUND'],
      ['STORY', 'story', 'STORY_NOT_FOUND'],
    ] as const)(
      'refuses a %s that is not waiting, and records nothing',
      async (type, name, errorCode) => {
        prisma[name].updateMany.mockResolvedValue({ count: 0 });

        await expect(
          service.approve('admin-1', type, 'x-1'),
        ).rejects.toMatchObject({ errorCode });
        expect(audit.execute).not.toHaveBeenCalled();
      },
    );
  });
});
