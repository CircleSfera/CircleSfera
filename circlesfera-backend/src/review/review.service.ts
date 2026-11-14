import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  REVIEW_PAGE_DEFAULT,
  REVIEW_PAGE_MAX,
  REVIEW_SUMMARY_DAYS,
  type ReviewEnforcementKind,
} from './review.constants.js';

const DAY_MS = 24 * 60 * 60 * 1000;

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

// What an external reviewer reads: the money that moves in total, and how
// the rules are enforced. Read only, and without any person's private data.
@Injectable()
export class ReviewService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async summary(now: number = Date.now()) {
    const since = new Date(now - REVIEW_SUMMARY_DAYS * DAY_MS);
    const [payments, disputes, reports, strikes, appeals, notices] =
      await Promise.all([
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
