import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
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
    it('counts the last 30 days of payments and enforcement', async () => {
      prisma.transaction.groupBy.mockResolvedValue([
        {
          type: 'PROMOTION_PAYMENT',
          status: 'COMPLETED',
          _count: { _all: 3 },
          _sum: { amount: 600, refundedCents: null },
        },
        {
          type: 'STRIPE_SUBSCRIPTION',
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
        payments: [
          {
            type: 'PROMOTION_PAYMENT',
            status: 'COMPLETED',
            count: 3,
            amountCents: 600,
            refundedCents: 0,
          },
          {
            type: 'STRIPE_SUBSCRIPTION',
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
      expect(summary).not.toHaveProperty('paidPostsOnSale');
      expect(summary).not.toHaveProperty('chargingAccounts');
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
