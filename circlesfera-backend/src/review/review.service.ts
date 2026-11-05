import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CHARGING_ACCOUNT_TYPES,
  POST_ON_SALE,
  REVIEW_PAGE_DEFAULT,
  REVIEW_PAGE_MAX,
  REVIEW_SUMMARY_DAYS,
  type ReviewEnforcementKind,
  type ReviewPaidKind,
  STORY_ON_SALE,
} from './review.constants.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// A creator as the review area names them: their public profile only.
const CREATOR_SELECT = {
  username: true,
  accountType: true,
  verificationLevel: true,
} as const;

function pageOf(page?: number, limit?: number) {
  const take = Math.min(
    Math.max(limit ?? REVIEW_PAGE_DEFAULT, 1),
    REVIEW_PAGE_MAX,
  );
  const current = Math.max(page ?? 1, 1);
  return { take, skip: (current - 1) * take, page: current };
}

function paged<T>(data: T[], total: number, page: number, take: number) {
  return {
    data,
    meta: {
      total,
      page,
      limit: take,
      totalPages: Math.max(1, Math.ceil(total / take)),
    },
  };
}

// Counts grouped by one field, as { value: count }.
function countsBy<K extends string>(
  rows: Array<{ _count: { _all: number } } & Record<K, string>>,
  key: K,
): Record<string, number> {
  return Object.fromEntries(rows.map((row) => [row[key], row._count._all]));
}

// What an external reviewer reads: what is sold, who sells it, the money it
// moves in total, and how the rules are enforced. Read only, and without any
// person's private data: creators by public username, everyone else by
// nothing at all.
@Injectable()
export class ReviewService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async summary(now: number = Date.now()) {
    const since = new Date(now - REVIEW_SUMMARY_DAYS * DAY_MS);
    const [
      paidPostsOnSale,
      paidStoriesOnSale,
      chargingAccounts,
      payments,
      disputes,
      reports,
      strikes,
      appeals,
      notices,
    ] = await Promise.all([
      this.prisma.post.count({ where: POST_ON_SALE }),
      this.prisma.story.count({ where: STORY_ON_SALE }),
      this.prisma.profile.count({
        where: { accountType: { in: CHARGING_ACCOUNT_TYPES } },
      }),
      this.prisma.transaction.groupBy({
        by: ['type', 'status'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { amount: true, refundedCents: true },
      }),
      this.prisma.paymentDispute.groupBy({
        by: ['status'],
        where: { openedAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.report.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.profileStrike.groupBy({
        by: ['consequence'],
        where: { createdAt: { gte: since }, kind: 'STRIKE' },
        _count: { _all: true },
      }),
      this.prisma.appeal.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.illegalContentNotice.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);

    return {
      days: REVIEW_SUMMARY_DAYS,
      paidPostsOnSale,
      paidStoriesOnSale,
      chargingAccounts,
      payments: payments.map((row) => ({
        type: row.type,
        status: row.status,
        count: row._count._all,
        amountCents: row._sum.amount ?? 0,
        refundedCents: row._sum.refundedCents ?? 0,
      })),
      disputes: countsBy(disputes, 'status'),
      reports: countsBy(reports, 'status'),
      strikes: countsBy(strikes, 'consequence'),
      appeals: countsBy(appeals, 'status'),
      illegalContentNotices: countsBy(notices, 'status'),
    };
  }

  // The paid posts (Frames included) or stories on sale now, newest first,
  // with their files so the reviewer sees what is sold, and how often it
  // sold. Every account's, private ones included; never a message.
  async paidContent(
    kind: ReviewPaidKind = 'post',
    page?: number,
    limit?: number,
  ) {
    const { take, skip, page: current } = pageOf(page, limit);

    if (kind === 'story') {
      const [total, stories] = await Promise.all([
        this.prisma.story.count({ where: STORY_ON_SALE }),
        this.prisma.story.findMany({
          where: STORY_ON_SALE,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          select: {
            id: true,
            createdAt: true,
            expiresAt: true,
            priceCents: true,
            moderationStatus: true,
            isCloseFriendsOnly: true,
            url: true,
            thumbnailUrl: true,
            mediaType: true,
            profile: { select: { ...CREATOR_SELECT, privacyLevel: true } },
            _count: { select: { storyUnlocks: true } },
          },
        }),
      ]);
      return paged(
        stories.map((story) => ({
          id: story.id,
          kind: 'story' as const,
          createdAt: story.createdAt,
          expiresAt: story.expiresAt,
          priceCents: story.priceCents,
          moderationStatus: story.moderationStatus,
          audience: story.isCloseFriendsOnly
            ? 'CLOSE_FRIENDS'
            : story.profile.privacyLevel,
          media: [
            {
              url: story.url,
              thumbnailUrl: story.thumbnailUrl,
              type: story.mediaType,
            },
          ],
          creator: {
            username: story.profile.username,
            accountType: story.profile.accountType,
            verificationLevel: story.profile.verificationLevel,
          },
          sales: story._count.storyUnlocks,
        })),
        total,
        current,
        take,
      );
    }

    const [total, posts] = await Promise.all([
      this.prisma.post.count({ where: POST_ON_SALE }),
      this.prisma.post.findMany({
        where: POST_ON_SALE,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          type: true,
          createdAt: true,
          caption: true,
          priceCents: true,
          moderationStatus: true,
          visibility: true,
          media: {
            orderBy: { order: 'asc' },
            select: { url: true, thumbnailUrl: true, type: true },
          },
          profile: { select: { ...CREATOR_SELECT, privacyLevel: true } },
          _count: { select: { postUnlocks: true } },
        },
      }),
    ]);
    return paged(
      posts.map((post) => ({
        id: post.id,
        kind: 'post' as const,
        postType: post.type,
        createdAt: post.createdAt,
        caption: post.caption,
        priceCents: post.priceCents,
        moderationStatus: post.moderationStatus,
        // A private account's post is its followers' whatever it says.
        audience:
          post.profile.privacyLevel === 'PRIVATE' ? 'PRIVATE' : post.visibility,
        media: post.media,
        creator: {
          username: post.profile.username,
          accountType: post.profile.accountType,
          verificationLevel: post.profile.verificationLevel,
        },
        sales: post._count.postUnlocks,
      })),
      total,
      current,
      take,
    );
  }

  // The accounts that may charge, newest first: their public profile, their
  // standing, how much they sold and earned in total, and their strikes.
  async creators(page?: number, limit?: number, now: number = Date.now()) {
    const { take, skip, page: current } = pageOf(page, limit);
    const where = { accountType: { in: CHARGING_ACCOUNT_TYPES } };
    const [total, profiles] = await Promise.all([
      this.prisma.profile.count({ where }),
      this.prisma.profile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          ...CREATOR_SELECT,
          createdAt: true,
          suspendedUntil: true,
          isAccountBanned: true,
          _count: {
            select: {
              posts: { where: POST_ON_SALE },
              strikes: {
                where: {
                  kind: 'STRIKE',
                  revokedAt: null,
                  expiresAt: { gt: new Date(now) },
                },
              },
            },
          },
        },
      }),
    ]);

    const earnings = profiles.length
      ? await this.prisma.transaction.groupBy({
          by: ['receiverProfileId'],
          where: {
            receiverProfileId: { in: profiles.map((p) => p.id) },
            status: 'COMPLETED',
          },
          _count: { _all: true },
          _sum: { amount: true },
        })
      : [];
    const earned = new Map(earnings.map((row) => [row.receiverProfileId, row]));

    return paged(
      profiles.map((profile) => {
        const row = earned.get(profile.id);
        return {
          username: profile.username,
          accountType: profile.accountType,
          verificationLevel: profile.verificationLevel,
          createdAt: profile.createdAt,
          standing: profile.isAccountBanned
            ? 'BANNED'
            : profile.suspendedUntil && profile.suspendedUntil.getTime() > now
              ? 'SUSPENDED'
              : 'ACTIVE',
          paidPostsOnSale: profile._count.posts,
          activeStrikes: profile._count.strikes,
          completedPayments: row?._count._all ?? 0,
          grossCents: row?._sum.amount ?? 0,
        };
      }),
      total,
      current,
      take,
    );
  }

  // How the rules are enforced, newest first: reports and their outcome,
  // strikes, appeals and notices of illegal content. Never who reported or
  // notified, what they wrote, nor staff's notes.
  async enforcement(
    kind: ReviewEnforcementKind,
    page?: number,
    limit?: number,
  ) {
    const { take, skip, page: current } = pageOf(page, limit);
    const order = { orderBy: { createdAt: 'desc' as const }, skip, take };

    switch (kind) {
      case 'reports': {
        const [total, data] = await Promise.all([
          this.prisma.report.count(),
          this.prisma.report.findMany({
            ...order,
            select: {
              id: true,
              createdAt: true,
              reason: true,
              targetType: true,
              status: true,
              urgent: true,
              resolvedAt: true,
            },
          }),
        ]);
        return paged(data, total, current, take);
      }
      case 'strikes': {
        const [total, strikes] = await Promise.all([
          this.prisma.profileStrike.count(),
          this.prisma.profileStrike.findMany({
            ...order,
            select: {
              id: true,
              createdAt: true,
              kind: true,
              reason: true,
              consequence: true,
              expiresAt: true,
              revokedAt: true,
              profile: { select: { username: true } },
            },
          }),
        ]);
        return paged(
          strikes.map(({ profile, ...strike }) => ({
            ...strike,
            username: profile.username,
          })),
          total,
          current,
          take,
        );
      }
      case 'appeals': {
        const [total, data] = await Promise.all([
          this.prisma.appeal.count(),
          this.prisma.appeal.findMany({
            ...order,
            select: {
              id: true,
              createdAt: true,
              targetType: true,
              status: true,
              resolvedAt: true,
            },
          }),
        ]);
        return paged(data, total, current, take);
      }
      case 'notices': {
        const [total, data] = await Promise.all([
          this.prisma.illegalContentNotice.count(),
          this.prisma.illegalContentNotice.findMany({
            ...order,
            select: {
              id: true,
              createdAt: true,
              childAbuse: true,
              status: true,
              decidedAt: true,
            },
          }),
        ]);
        return paged(data, total, current, take);
      }
    }
  }
}
