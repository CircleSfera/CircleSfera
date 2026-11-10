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

describe('AdminFirstPaidReviewService', () => {
  let prisma: any;
  let audit: { execute: ReturnType<typeof vi.fn> };
  let service: AdminFirstPaidReviewService;

  beforeEach(() => {
    prisma = {
      post: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(0),
      },
      story: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma));
    audit = { execute: vi.fn().mockResolvedValue(undefined) };
    service = new AdminFirstPaidReviewService(prisma, audit as any);
  });

  describe('list', () => {
    it('shows priced posts and stories waiting, oldest first, with how many a person passed', async () => {
      prisma.post.findMany.mockResolvedValue([
        {
          id: 'post-2',
          caption: 'Second',
          priceCents: 500,
          createdAt: new Date('2026-11-03'),
          profile: profile('ana'),
          media: [{ url: 'p.jpg' }],
        },
      ]);
      prisma.story.findMany.mockResolvedValue([
        {
          id: 'story-1',
          priceCents: 300,
          createdAt: new Date('2026-11-01'),
          url: 's.mp4',
          thumbnailUrl: 's.jpg',
          mediaType: 'video',
          profile: profile('ana'),
        },
      ]);
      prisma.post.count.mockResolvedValue(1);

      const res = await service.list();

      expect(prisma.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: WAITING,
          orderBy: { createdAt: 'asc' },
        }),
      );
      expect(prisma.story.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: WAITING }),
      );
      expect(res.needed).toBe(FIRST_PAID_ITEMS_REVIEWED_BY_STAFF);
      expect(res.items.map((i) => i.id)).toEqual(['story-1', 'post-2']);
      expect(res.items[0]).toMatchObject({
        type: 'STORY',
        caption: null,
        passedByStaff: 1,
        media: [{ url: 's.mp4', thumbnailUrl: 's.jpg', type: 'video' }],
      });
      // One count per Profile, not per item.
      expect(prisma.post.count).toHaveBeenCalledTimes(1);
    });

    it('leaves out Profiles a person has already passed enough of', async () => {
      prisma.post.findMany.mockResolvedValue([
        {
          id: 'post-1',
          caption: null,
          priceCents: 500,
          createdAt: new Date('2026-11-01'),
          profile: profile('trusted'),
          media: [],
        },
      ]);
      prisma.post.count.mockResolvedValue(FIRST_PAID_ITEMS_REVIEWED_BY_STAFF);

      expect((await service.list()).items).toEqual([]);
    });
  });

  describe('approve', () => {
    it.each([
      ['POST', 'post'],
      ['STORY', 'story'],
    ] as const)(
      'puts a waiting %s on sale as passed by a person, in the audit log',
      async (type, model) => {
        await expect(service.approve('admin-1', type, 'x-1')).resolves.toEqual({
          approved: true,
        });

        expect(prisma[model].updateMany).toHaveBeenCalledWith({
          where: { id: 'x-1', ...WAITING },
          data: {
            moderationPassedAt: expect.any(Date),
            moderationPassedByStaff: true,
          },
        });
        expect(audit.execute).toHaveBeenCalledWith(
          'admin-1',
          'PAID_CONTENT_APPROVED',
          model,
          'x-1',
          undefined,
          undefined,
          prisma,
        );
      },
    );

    it.each([
      ['POST', 'post', 'POST_NOT_FOUND'],
      ['STORY', 'story', 'STORY_NOT_FOUND'],
    ] as const)(
      'refuses a %s that is not waiting, and records nothing',
      async (type, model, errorCode) => {
        prisma[model].updateMany.mockResolvedValue({ count: 0 });

        await expect(
          service.approve('admin-1', type, 'x-1'),
        ).rejects.toMatchObject({ errorCode });
        expect(audit.execute).not.toHaveBeenCalled();
      },
    );
  });
});
