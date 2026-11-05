import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  POST_ON_SALE,
  REVIEW_PAGE_MAX,
  STORY_ON_SALE,
} from './review.constants.js';
import { ReviewService } from './review.service.js';

const model = () => ({
  count: vi.fn().mockResolvedValue(0),
  findMany: vi.fn().mockResolvedValue([]),
  groupBy: vi.fn().mockResolvedValue([]),
});

describe('ReviewService', () => {
  let prisma: Record<string, ReturnType<typeof model>>;
  let service: ReviewService;
  const NOW = Date.UTC(2026, 10, 30);

  beforeEach(() => {
    prisma = {
      post: model(),
      story: model(),
      profile: model(),
      transaction: model(),
      paymentDispute: model(),
      report: model(),
      profileStrike: model(),
      appeal: model(),
      illegalContentNotice: model(),
    };
    service = new ReviewService(prisma as unknown as PrismaService);
  });

  // Every field a query asks for, at any depth.
  const fieldsAsked = (select: Record<string, unknown>): string[] =>
    Object.entries(select).flatMap(([key, value]) =>
      value && typeof value === 'object'
        ? [
            key,
            ...fieldsAsked(
              ((value as { select?: object }).select ?? value) as Record<
                string,
                unknown
              >,
            ),
          ]
        : [key],
    );
  const PRIVATE_FIELDS = [
    'email',
    'ipAddress',
    'userAgent',
    'details',
    'internalNotes',
    'adminNotes',
    'reason',
    'notifierName',
    'notifierEmail',
    'explanation',
    'decision',
    'reporter',
    'reporterId',
    'user',
    'userId',
    'stripePaymentIntentId',
    'content',
  ];

  describe('summary', () => {
    it('counts what is on sale and the last 30 days of payments and enforcement', async () => {
      prisma.post.count.mockResolvedValue(4);
      prisma.story.count.mockResolvedValue(2);
      prisma.profile.count.mockResolvedValue(9);
      prisma.transaction.groupBy.mockResolvedValue([
        {
          type: 'DIRECT_TIP',
          status: 'COMPLETED',
          _count: { _all: 3 },
          _sum: { amount: 600, refundedCents: null },
        },
        {
          type: 'DIRECT_POST_UNLOCK',
          status: 'REFUNDED',
          _count: { _all: 1 },
          _sum: { amount: null, refundedCents: 500 },
        },
      ]);
      prisma.report.groupBy.mockResolvedValue([
        { status: 'RESOLVED', _count: { _all: 7 } },
      ]);
      prisma.profileStrike.groupBy.mockResolvedValue([
        { consequence: 'SUSPENDED', _count: { _all: 1 } },
      ]);

      const summary = await service.summary(NOW);

      expect(summary).toMatchObject({
        days: 30,
        paidPostsOnSale: 4,
        paidStoriesOnSale: 2,
        chargingAccounts: 9,
        payments: [
          {
            type: 'DIRECT_TIP',
            status: 'COMPLETED',
            count: 3,
            amountCents: 600,
            refundedCents: 0,
          },
          {
            type: 'DIRECT_POST_UNLOCK',
            status: 'REFUNDED',
            count: 1,
            amountCents: 0,
            refundedCents: 500,
          },
        ],
        reports: { RESOLVED: 7 },
        strikes: { SUSPENDED: 1 },
        disputes: {},
        appeals: {},
        illegalContentNotices: {},
      });
      expect(prisma.post.count).toHaveBeenCalledWith({ where: POST_ON_SALE });
      expect(prisma.story.count).toHaveBeenCalledWith({ where: STORY_ON_SALE });
      const since = new Date(NOW - 30 * 24 * 60 * 60 * 1000);
      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { createdAt: { gte: since } } }),
      );
      expect(prisma.paymentDispute.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { openedAt: { gte: since } } }),
      );
    });

    it('defaults to now', async () => {
      await service.summary();
      expect(prisma.report.groupBy).toHaveBeenCalled();
    });
  });

  describe('paid content', () => {
    const creator = {
      username: 'ana',
      accountType: 'CREATOR',
      verificationLevel: 'VERIFIED',
    };

    it("lists the paid posts on sale, with their files and sales, a private account's as private", async () => {
      prisma.post.count.mockResolvedValue(41);
      prisma.post.findMany.mockResolvedValue([
        {
          id: 'p-1',
          type: 'FRAME',
          createdAt: new Date(NOW),
          caption: 'Behind the scenes',
          priceCents: 500,
          moderationStatus: 'VISIBLE',
          visibility: 'PUBLIC',
          media: [{ url: '/uploads/a.mp4', thumbnailUrl: null, type: 'video' }],
          profile: { ...creator, privacyLevel: 'PRIVATE' },
          _count: { postUnlocks: 12 },
        },
      ]);

      const page = await service.paidContent('post', 3, 20);

      expect(page).toEqual({
        data: [
          {
            id: 'p-1',
            kind: 'post',
            postType: 'FRAME',
            createdAt: new Date(NOW),
            caption: 'Behind the scenes',
            priceCents: 500,
            moderationStatus: 'VISIBLE',
            audience: 'PRIVATE',
            media: [
              { url: '/uploads/a.mp4', thumbnailUrl: null, type: 'video' },
            ],
            creator,
            sales: 12,
          },
        ],
        meta: { total: 41, page: 3, limit: 20, totalPages: 3 },
      });
      const args = prisma.post.findMany.mock.calls[0][0];
      expect(args).toMatchObject({ where: POST_ON_SALE, skip: 40, take: 20 });
      for (const field of PRIVATE_FIELDS) {
        expect(fieldsAsked(args.select)).not.toContain(field);
      }
    });

    it("a public account's post keeps its own audience", async () => {
      prisma.post.findMany.mockResolvedValue([
        {
          id: 'p-2',
          type: 'POST',
          createdAt: new Date(NOW),
          caption: null,
          priceCents: 300,
          moderationStatus: 'FLAGGED',
          visibility: 'FOLLOWERS',
          media: [],
          profile: { ...creator, privacyLevel: 'PUBLIC' },
          _count: { postUnlocks: 0 },
        },
      ]);
      const page = await service.paidContent();
      expect(page.data[0]).toMatchObject({ audience: 'FOLLOWERS' });
      expect(page.meta).toEqual({
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it("lists the paid stories on sale, close friends' ones named so", async () => {
      prisma.story.count.mockResolvedValue(2);
      const story = {
        id: 's-1',
        createdAt: new Date(NOW),
        expiresAt: new Date(NOW + 1000),
        priceCents: 300,
        moderationStatus: 'VISIBLE',
        isCloseFriendsOnly: false,
        url: '/uploads/s.jpg',
        thumbnailUrl: '/uploads/s-thumb.jpg',
        mediaType: 'image',
        profile: { ...creator, privacyLevel: 'PUBLIC' },
        _count: { storyUnlocks: 4 },
      };
      prisma.story.findMany.mockResolvedValue([
        story,
        { ...story, id: 's-2', isCloseFriendsOnly: true },
      ]);

      const page = await service.paidContent('story', 1, 500);

      expect(page.data[0]).toEqual({
        id: 's-1',
        kind: 'story',
        createdAt: new Date(NOW),
        expiresAt: new Date(NOW + 1000),
        priceCents: 300,
        moderationStatus: 'VISIBLE',
        audience: 'PUBLIC',
        media: [
          {
            url: '/uploads/s.jpg',
            thumbnailUrl: '/uploads/s-thumb.jpg',
            type: 'image',
          },
        ],
        creator,
        sales: 4,
      });
      expect(page.data[1]).toMatchObject({ audience: 'CLOSE_FRIENDS' });
      // Never more than a page holds.
      expect(prisma.story.findMany.mock.calls[0][0]).toMatchObject({
        where: STORY_ON_SALE,
        take: REVIEW_PAGE_MAX,
      });
    });
  });

  describe('creators', () => {
    const profile = (extra: Record<string, unknown> = {}) => ({
      id: 'pr-1',
      username: 'ana',
      accountType: 'CREATOR',
      verificationLevel: 'VERIFIED',
      createdAt: new Date(NOW),
      suspendedUntil: null,
      isAccountBanned: false,
      _count: { posts: 3, strikes: 1 },
      ...extra,
    });

    it('names each by public profile, with standing, sales and strikes', async () => {
      prisma.profile.count.mockResolvedValue(3);
      prisma.profile.findMany.mockResolvedValue([
        profile(),
        profile({
          id: 'pr-2',
          username: 'bea',
          suspendedUntil: new Date(NOW + 1000),
        }),
        profile({ id: 'pr-3', username: 'cris', isAccountBanned: true }),
      ]);
      prisma.transaction.groupBy.mockResolvedValue([
        {
          receiverProfileId: 'pr-1',
          _count: { _all: 5 },
          _sum: { amount: 2500 },
        },
        {
          receiverProfileId: 'pr-3',
          _count: { _all: 1 },
          _sum: { amount: null },
        },
      ]);

      const page = await service.creators(1, 20, NOW);

      expect(page.data).toEqual([
        {
          username: 'ana',
          accountType: 'CREATOR',
          verificationLevel: 'VERIFIED',
          createdAt: new Date(NOW),
          standing: 'ACTIVE',
          paidPostsOnSale: 3,
          activeStrikes: 1,
          completedPayments: 5,
          grossCents: 2500,
        },
        expect.objectContaining({
          username: 'bea',
          standing: 'SUSPENDED',
          completedPayments: 0,
          grossCents: 0,
        }),
        expect.objectContaining({
          username: 'cris',
          standing: 'BANNED',
          completedPayments: 1,
          grossCents: 0,
        }),
      ]);
      expect(page.data[0]).not.toHaveProperty('id');
      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            receiverProfileId: { in: ['pr-1', 'pr-2', 'pr-3'] },
            status: 'COMPLETED',
          },
        }),
      );
      const { select } = prisma.profile.findMany.mock.calls[0][0];
      expect(select._count.select.strikes.where).toEqual({
        kind: 'STRIKE',
        revokedAt: null,
        expiresAt: { gt: new Date(NOW) },
      });
    });

    it('a past suspension is no longer standing; an empty page asks for no totals', async () => {
      prisma.profile.findMany.mockResolvedValueOnce([
        profile({ suspendedUntil: new Date(NOW - 1000) }),
      ]);
      const page = await service.creators(undefined, undefined, NOW);
      expect(page.data[0]).toMatchObject({ standing: 'ACTIVE' });

      prisma.transaction.groupBy.mockClear();
      prisma.profile.findMany.mockResolvedValueOnce([]);
      await service.creators();
      expect(prisma.transaction.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('enforcement', () => {
    it.each([
      ['reports', 'report'],
      ['appeals', 'appeal'],
      ['notices', 'illegalContentNotice'],
    ] as const)(
      'lists %s newest first, asking for nothing private',
      async (kind, table) => {
        prisma[table].count.mockResolvedValue(1);
        prisma[table].findMany.mockResolvedValue([{ id: 'x-1' }]);

        const page = await service.enforcement(kind, 2, 10);

        expect(page).toEqual({
          data: [{ id: 'x-1' }],
          meta: { total: 1, page: 2, limit: 10, totalPages: 1 },
        });
        const args = prisma[table].findMany.mock.calls[0][0];
        expect(args).toMatchObject({
          orderBy: { createdAt: 'desc' },
          skip: 10,
          take: 10,
        });
        // A report's reason is its category, never what the reporter wrote.
        const allowed = kind === 'reports' ? ['reason'] : [];
        for (const field of PRIVATE_FIELDS.filter(
          (f) => !allowed.includes(f),
        )) {
          expect(fieldsAsked(args.select)).not.toContain(field);
        }
      },
    );

    it('lists strikes with the username of the Profile only', async () => {
      prisma.profileStrike.findMany.mockResolvedValue([
        {
          id: 'st-1',
          kind: 'STRIKE',
          reason: 'SPAM',
          consequence: 'NONE',
          profile: { username: 'ana' },
        },
      ]);

      const page = await service.enforcement('strikes');

      expect(page.data).toEqual([
        {
          id: 'st-1',
          kind: 'STRIKE',
          reason: 'SPAM',
          consequence: 'NONE',
          username: 'ana',
        },
      ]);
      const { select } = prisma.profileStrike.findMany.mock.calls[0][0];
      expect(select.profile).toEqual({ select: { username: true } });
      expect(select).not.toHaveProperty('adminId');
      expect(select).not.toHaveProperty('reportId');
    });
  });
});
