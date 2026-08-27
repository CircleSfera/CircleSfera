import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { AdminAction, Prisma } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AdminStatsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  /** Log every admin action for accountability. */
  async logAction(
    adminId: string,
    action: AdminAction,
    targetType: string,
    targetId: string,
    details?: string,
  ) {
    await this.prisma.adminAuditLog.create({
      data: { adminId, action, targetType, targetId, details },
    });
  }

  // ─── Dashboard Stats ──────────────────────────────────────────────

  async getDashboardStats() {
    // Quick cache for dashboard
    const cacheKey = 'admin:dashboard_stats';
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const [totalUsers, totalPosts, activeUsers, pendingReports] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.post.count(),
        this.prisma.user.count({ where: { isActive: true } }),
        this.prisma.report.count({
          where: { status: { in: ['PENDING', 'REVIEWING'] } },
        }),
      ]);

    const result = {
      totalUsers,
      totalPosts,
      activeUsers,
      pendingReports,
    };

    // Cache for 2 minutes to prevent DB locks on page reload
    await this.cacheManager.set(cacheKey, result, 120000);
    return result;
  }

  /**
   * Optimized Enhanced Stats: caches heavily to avoid running parallel counts on millions of rows.
   */
  async getEnhancedStats() {
    const cacheKey = 'admin:enhanced_stats';
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalPosts,
      totalStories,
      pendingReports,
      totalReports,
      newUsersThisWeek,
      newUsersLastWeek,
      newPostsThisWeek,
      newPostsLastWeek,
      totalLikes,
      totalComments,
      activeUsersToday,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.post.count(),
      this.prisma.story.count(),
      this.prisma.report.count({ where: { status: 'PENDING' } }),
      this.prisma.report.count(),
      this.prisma.user.count({
        where: { createdAt: { gte: oneWeekAgo } },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: twoWeeksAgo, lt: oneWeekAgo } },
      }),
      this.prisma.post.count({
        where: { createdAt: { gte: oneWeekAgo } },
      }),
      this.prisma.post.count({
        where: { createdAt: { gte: twoWeeksAgo, lt: oneWeekAgo } },
      }),
      this.prisma.like.count(),
      this.prisma.comment.count(),
      this.prisma.user.count({
        where: {
          OR: [{ isOnline: true }, { lastSeenAt: { gte: oneDayAgo } }],
        },
      }),
    ]);

    const recentAuditLogs = await this.prisma.adminAuditLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        admin: {
          select: { displayName: true, email: true },
        },
      },
    });

    const calcGrowth = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    const result = {
      users: totalUsers,
      posts: totalPosts,
      stories: totalStories,
      pendingReports,
      newUsersThisWeek,
      userGrowth: calcGrowth(newUsersThisWeek, newUsersLastWeek),
      newPostsThisWeek,
      postGrowth: calcGrowth(newPostsThisWeek, newPostsLastWeek),
      engagement:
        totalPosts > 0
          ? Math.round(((totalLikes + totalComments) / totalPosts) * 100) / 100
          : 0,
      reportedContentPercent:
        totalPosts > 0
          ? Math.round((totalReports / totalPosts) * 10000) / 100
          : 0,
      activeUsersToday,
      recentActivity: (recentAuditLogs ?? []).map((log) => ({
        id: log.id,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        details: log.details,
        createdAt: log.createdAt,
        adminUsername: log.admin?.displayName || log.admin?.email || 'Unknown',
      })),
    };

    // Cache for 5 minutes since these metrics are expensive
    await this.cacheManager.set(cacheKey, result, 300000);
    return result;
  }

  async getActivityChart(numDays: number = 14) {
    const cacheKey = `admin:activity_chart_${numDays}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const since = new Date();
    since.setDate(since.getDate() - (numDays - 1));
    since.setHours(0, 0, 0, 0);

    const [posts, users, stories, reports] = await Promise.all([
      this.prisma.post.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.user.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.story.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.report.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true },
      }),
    ]);

    const days: {
      date: string;
      posts: number;
      users: number;
      stories: number;
      reports: number;
    }[] = [];
    for (let i = 0; i < numDays; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      days.push({
        date: d.toISOString().slice(0, 10),
        posts: 0,
        users: 0,
        stories: 0,
        reports: 0,
      });
    }

    const bump = (
      items: { createdAt: Date }[],
      key: 'posts' | 'users' | 'stories' | 'reports',
    ) => {
      for (const item of items) {
        const dayKey = item.createdAt.toISOString().slice(0, 10);
        const entry = days.find((d) => d.date === dayKey);
        if (entry) entry[key]++;
      }
    };

    bump(posts, 'posts');
    bump(users, 'users');
    bump(stories, 'stories');
    bump(reports, 'reports');

    await this.cacheManager.set(cacheKey, days, 300000);
    return days;
  }

  // ─── Analytics ───────────────────────────────────────────────────

  async getMonetizationAnalytics(): Promise<Record<string, unknown>> {
    interface SubscriptionWithPlan {
      id: string;
      status: string;
      planId: string;
      plan: {
        id: string;
        name: string;
        priceCents: number;
      };
    }

    const prisma = this.prisma as unknown as {
      platformSubscription: {
        findMany(args: {
          where?: Record<string, unknown>;
          include?: Record<string, boolean>;
        }): Promise<SubscriptionWithPlan[]>;
        count(args: { where?: Record<string, unknown> }): Promise<number>;
      };
    };

    const rawSubscriptions = await prisma.platformSubscription.findMany({
      where: { status: 'ACTIVE' },
      include: { plan: true },
    });

    let activeMRR = 0;
    const tierCounts: Record<string, number> = {
      PREMIUM: 0,
      ELITE: 0,
      BUSINESS: 0,
    };

    rawSubscriptions.forEach((sub) => {
      activeMRR += (sub.plan?.priceCents || 0) / 100;
      const planName = sub.plan?.name?.toUpperCase() || '';
      if (planName.includes('PREMIUM')) tierCounts.PREMIUM++;
      else if (planName.includes('ELITE')) tierCounts.ELITE++;
      else if (planName.includes('BUSINESS')) tierCounts.BUSINESS++;
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const [recentSubs, olderSubs] = await Promise.all([
      prisma.platformSubscription.count({
        where: {
          status: 'ACTIVE',
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      prisma.platformSubscription.count({
        where: {
          status: 'ACTIVE',
          createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
        },
      }),
    ]);

    let subscriptionGrowth = 0;
    if (olderSubs > 0) {
      subscriptionGrowth = Math.round(
        ((recentSubs - olderSubs) / olderSubs) * 100,
      );
    } else if (recentSubs > 0) {
      subscriptionGrowth = 100;
    }

    return {
      activeMRR,
      totalSubscriptions: rawSubscriptions.length,
      tierDistribution: tierCounts,
      subscriptionGrowth,
    };
  }

  // ─── Payouts ──────────────────────────────────────────────────────

  async getPayoutStats() {
    const stats = await this.prisma.stripePayoutLog.groupBy({
      by: ['status'],
      _count: true,
      _sum: { amountCents: true },
    });

    let pendingCount = 0,
      totalPending = 0,
      completedCount = 0,
      totalCompleted = 0;
    for (const stat of stats) {
      if (stat.status === 'pending') {
        pendingCount = stat._count;
        totalPending = stat._sum.amountCents || 0;
      } else if (stat.status === 'paid') {
        completedCount = stat._count;
        totalCompleted = stat._sum.amountCents || 0;
      }
    }
    return { pendingCount, totalPending, completedCount, totalCompleted };
  }

  async getPayouts(page = 1, limit = 20, status?: string, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.user = {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          {
            profiles: {
              some: { username: { contains: search, mode: 'insensitive' } },
            },
          },
        ],
      };
    }
    const [data, total] = await Promise.all([
      this.prisma.stripePayoutLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { include: { profiles: true } },
        },
      }),
      this.prisma.stripePayoutLog.count({ where }),
    ]);
    return { data, meta: { total, page, limit } };
  }

  // ─── Top Users by Engagement ──────────────────────────────────

  async getTopUsers() {
    const cacheKey = 'admin:top_users';
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        profiles: {
          select: {
            username: true,
            avatar: true,
            fullName: true,
            posts: {
              select: {
                _count: { select: { likes: true, comments: true } },
              },
            },
          },
        },
      },
    });

    const ranked = users
      .map((u) => {
        const profile = u.profiles[0];
        const totalLikes =
          profile?.posts?.reduce((sum, p) => sum + p._count.likes, 0) || 0;
        const totalComments =
          profile?.posts?.reduce((sum, p) => sum + p._count.comments, 0) || 0;
        return {
          id: u.id,
          username: profile?.username || 'unknown',
          avatar: profile?.avatar,
          fullName: profile?.fullName,
          totalLikes,
          totalComments,
          engagement: totalLikes + totalComments,
        };
      })
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 5);

    await this.cacheManager.set(cacheKey, ranked, 3600000); // 1 hour cache
    return ranked;
  }

  // ─── Transactions (JSON ledger) ───────────────────────────────────

  async getTransactions(
    page = 1,
    limit = 20,
    status?: string,
    search?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.TransactionWhereInput = {};

    if (
      status &&
      ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'].includes(status)
    ) {
      where.status = status as any;
    }

    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { description: { contains: q, mode: 'insensitive' } },
        { sender: { email: { contains: q, mode: 'insensitive' } } },
        { receiver: { email: { contains: q, mode: 'insensitive' } } },
        {
          sender: {
            profiles: {
              some: { username: { contains: q, mode: 'insensitive' } },
            },
          },
        },
        {
          receiver: {
            profiles: {
              some: { username: { contains: q, mode: 'insensitive' } },
            },
          },
        },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: {
            select: {
              email: true,
              profiles: { select: { username: true } },
            },
          },
          receiver: {
            select: {
              email: true,
              profiles: { select: { username: true } },
            },
          },
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);

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

  // ─── Audit Logs ───────────────────────────────────────────────────

  async getAuditLogs(
    page = 1,
    limit = 20,
    filters?: {
      action?: string;
      search?: string;
      from?: string;
      to?: string;
    },
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.AdminAuditLogWhereInput = {};

    if (filters?.action) {
      where.action = filters.action as AdminAction;
    }

    if (filters?.from || filters?.to) {
      where.createdAt = {};
      if (filters.from) {
        const fromDate = new Date(filters.from);
        if (!Number.isNaN(fromDate.getTime())) {
          where.createdAt.gte = fromDate;
        }
      }
      if (filters.to) {
        const toDate = new Date(filters.to);
        if (!Number.isNaN(toDate.getTime())) {
          where.createdAt.lte = toDate;
        }
      }
    }

    if (filters?.search?.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { targetId: { contains: q, mode: 'insensitive' } },
        { details: { contains: q, mode: 'insensitive' } },
        {
          admin: {
            OR: [
              { displayName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const [logs, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          admin: {
            select: { displayName: true, email: true },
          },
        },
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);

    return {
      data: (logs ?? []).map((log) => ({
        id: log.id,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        details: log.details,
        createdAt: log.createdAt,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        requestId: log.requestId,
        adminUsername: log.admin?.displayName || log.admin?.email || 'Unknown',
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}
