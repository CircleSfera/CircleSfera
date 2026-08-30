import { Inject, Injectable } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import {
  toAdminUser,
  withPrimaryProfile,
} from '../../../../common/utils/user-profile-shape.util.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import {
  computeMttr,
  REPORT_MTTR_SAMPLE_LIMIT,
  REPORT_MTTR_WINDOW_DAYS,
} from '../../../utils/report-mttr.util.js';

@Injectable()
export class GetContentQuery {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getHashtags(page = 1, limit = 20, search?: string) {
    const where: Prisma.HashtagWhereInput = search
      ? { tag: { contains: search, mode: 'insensitive' as const } }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.hashtag.findMany({
        where,
        orderBy: { postCount: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.hashtag.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getComments(
    page = 1,
    limit = 10,
    search?: string,
    userId?: string,
    moderationStatus?: string,
  ) {
    const where: Prisma.CommentWhereInput = {};
    if (search?.trim()) {
      where.content = { contains: search.trim(), mode: 'insensitive' };
    }
    if (userId) {
      where.profile = { userId };
    }
    if (
      moderationStatus &&
      ['VISIBLE', 'FLAGGED', 'HIDDEN', 'REMOVED'].includes(moderationStatus)
    ) {
      where.moderationStatus = moderationStatus as $Enums.ModerationStatus;
    }

    const [comments, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          profile: {
            select: { username: true, avatar: true },
          },
          post: { select: { id: true, caption: true } },
        },
      }),
      this.prisma.comment.count({ where }),
    ]);

    const data = comments.map(({ profile, ...rest }) => ({
      ...rest,
      profile,
      user: toAdminUser(profile),
    }));

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getStories(
    page = 1,
    limit = 10,
    filters?: {
      moderationStatus?: string;
      expired?: string;
      userId?: string;
    },
  ) {
    const where: Prisma.StoryWhereInput = {};
    if (filters?.userId) {
      where.profile = { userId: filters.userId };
    }
    if (
      filters?.moderationStatus &&
      ['VISIBLE', 'FLAGGED', 'HIDDEN', 'REMOVED'].includes(
        filters.moderationStatus,
      )
    ) {
      where.moderationStatus =
        filters.moderationStatus as $Enums.ModerationStatus;
    }
    if (filters?.expired === 'true') {
      where.expiresAt = { lt: new Date() };
    } else if (filters?.expired === 'false') {
      where.expiresAt = { gte: new Date() };
    }

    const [stories, total] = await Promise.all([
      this.prisma.story.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          profile: {
            select: { username: true, avatar: true },
          },
          _count: { select: { views: true, reactions: true } },
        },
      }),
      this.prisma.story.count({ where }),
    ]);

    const data = stories.map(({ profile, ...rest }) => ({
      ...rest,
      profile,
      user: toAdminUser(profile),
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getTrustQueue() {
    const take = 10;
    const mttrSince = new Date(
      Date.now() - REPORT_MTTR_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const [
      reports,
      appeals,
      tickets,
      reportCount,
      appealCount,
      ticketCount,
      resolvedReportsForMttr,
      resolvedAppealsForMttr,
      resolvedTicketsForMttr,
    ] = await Promise.all([
      this.prisma.report.findMany({
        where: { status: { in: ['PENDING', 'REVIEWING'] } },
        orderBy: { createdAt: 'desc' },
        take,
        include: {
          reporter: {
            select: {
              username: true,
            },
          },
          assignedAdmin: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
        },
      }),
      this.prisma.appeal.findMany({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take,
        include: {
          user: {
            select: {
              email: true,
              profiles: { select: { username: true } },
            },
          },
        },
      }),
      this.prisma.supportTicket.findMany({
        where: { status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.report.count({
        where: { status: { in: ['PENDING', 'REVIEWING'] } },
      }),
      this.prisma.appeal.count({ where: { status: 'PENDING' } }),
      this.prisma.supportTicket.count({ where: { status: 'OPEN' } }),
      this.prisma.report.findMany({
        where: {
          resolvedAt: { not: null, gte: mttrSince },
        },
        orderBy: { resolvedAt: 'desc' },
        take: REPORT_MTTR_SAMPLE_LIMIT,
        select: { createdAt: true, resolvedAt: true },
      }),
      this.prisma.appeal.findMany({
        where: {
          resolvedAt: { not: null, gte: mttrSince },
        },
        orderBy: { resolvedAt: 'desc' },
        take: REPORT_MTTR_SAMPLE_LIMIT,
        select: { createdAt: true, resolvedAt: true },
      }),
      this.prisma.supportTicket.findMany({
        where: {
          resolvedAt: { not: null, gte: mttrSince },
        },
        orderBy: { resolvedAt: 'desc' },
        take: REPORT_MTTR_SAMPLE_LIMIT,
        select: { createdAt: true, resolvedAt: true },
      }),
    ]);

    return {
      reports: reports.map((report) => ({
        ...report,
        reporter: report.reporter ? toAdminUser(report.reporter) : null,
      })),
      appeals: appeals.map((appeal) => ({
        ...appeal,
        user: appeal.user ? withPrimaryProfile(appeal.user) : null,
      })),
      tickets,
      counts: {
        reports: reportCount,
        appeals: appealCount,
        tickets: ticketCount,
      },
      reportMttr: computeMttr(resolvedReportsForMttr),
      appealMttr: computeMttr(resolvedAppealsForMttr),
      ticketMttr: computeMttr(resolvedTicketsForMttr),
    };
  }

  async exportPostsCSV() {
    const posts = await this.prisma.post.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        profile: {
          select: { username: true },
        },
        _count: { select: { likes: true, comments: true } },
      },
    });

    const header = 'ID,Author,Type,Caption,Likes,Comments,Created';
    const rows = posts.map((p) =>
      [
        p.id,
        p.profile?.username || '',
        p.type,
        `"${(p.caption || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
        p._count.likes,
        p._count.comments,
        p.createdAt.toISOString(),
      ].join(','),
    );

    return [header, ...rows].join('\n');
  }
}
