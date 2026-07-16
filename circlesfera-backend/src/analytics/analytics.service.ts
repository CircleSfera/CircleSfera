import { Inject, Injectable, Logger } from '@nestjs/common';
import { format, startOfDay, subDays } from 'date-fns';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateEventBatchDto, CreateEventDto } from './dto/create-event.dto.js';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Automated task to aggregate stats for all active creators.
   * Runs every day at midnight via BullMQ.
   */
  async handleDailyAggregation() {
    this.logger.log('Starting daily analytics aggregation...');
    try {
      // Find all users who have created a post in the last 24h or have active promotions
      const creators = await this.prisma.user.findMany({
        where: {
          OR: [
            { posts: { some: {} } },
            { promotions: { some: { status: 'ACTIVE' } } },
          ],
        },
        select: { id: true },
      });

      this.logger.log(`Aggregating stats for ${creators.length} creators`);

      for (const creator of creators) {
        await this.performDailyAggregation(creator.id);
      }

      this.logger.log('Daily analytics aggregation completed successfully');
    } catch (error) {
      this.logger.error('Failed to perform daily aggregation:', error);
    }
  }

  /**
   * Log a single telemetry event.
   */
  async logEvent(userId: string | null, dto: CreateEventDto) {
    try {
      return await this.prisma.interactionEvent.create({
        data: {
          userId: userId || null,
          eventType: dto.eventType,
          targetId: dto.targetId,
          targetType: dto.targetType,
          dwellTime: dto.dwellTime,
        },
      });
    } catch (error) {
      this.logger.error('Failed to log interaction event:', error);
    }
  }

  /**
   * Log a batch of telemetry events.
   */
  async logEventsBatch(userId: string | null, dto: CreateEventBatchDto) {
    try {
      const data = dto.events.map((e) => ({
        userId: userId || null,
        eventType: e.eventType,
        targetId: e.targetId,
        targetType: e.targetType,
        dwellTime: e.dwellTime,
      }));

      return await this.prisma.interactionEvent.createMany({
        data,
      });
    } catch (error) {
      this.logger.error('Failed to log batch interaction events:', error);
    }
  }

  /**
   * Clean up interaction events older than 90 days.
   */
  async cleanupOldEvents() {
    this.logger.log('Starting interaction events cleanup...');
    try {
      const ninetyDaysAgo = subDays(new Date(), 90);
      const { count } = await this.prisma.interactionEvent.deleteMany({
        where: {
          createdAt: { lt: ninetyDaysAgo },
        },
      });
      this.logger.log(
        `Cleaned up ${count} interaction events older than 90 days.`,
      );
    } catch (error) {
      this.logger.error('Failed to clean up old interaction events:', error);
    }
  }

  /**
   * Records a view for a post.
   * Increments the counter and creates a detailed view record if it's the first time for this user.
   */
  async trackPostView(postId: string, viewerId?: string) {
    try {
      // 1. Increment total views counter (simple & fast)
      await this.prisma.post.update({
        where: { id: postId },
        data: { views: { increment: 1 } },
      });

      // 2. Track unique view if viewerId is provided
      if (viewerId) {
        const existingView = await this.prisma.postView.findFirst({
          where: { postId, viewerId },
        });

        if (!existingView) {
          await this.prisma.postView.create({
            data: { postId, viewerId },
          });
        }
      }
    } catch (error) {
      this.logger.error(`Failed to track post view for ${postId}:`, error);
    }
  }

  /**
   * Records a loop for a Frame (vertical video).
   */
  async trackFrameLoop(postId: string) {
    try {
      await this.prisma.post.update({
        where: { id: postId, type: 'FRAME' },
        data: { loops: { increment: 1 } },
      });
    } catch (error) {
      this.logger.error(`Failed to track frame loop for ${postId}:`, error);
    }
  }

  /**
   * Records watch time for a Frame (vertical video).
   */
  async trackFrameWatchTime(postId: string, seconds: number) {
    try {
      await this.prisma.post.update({
        where: { id: postId, type: 'FRAME' },
        data: { watchTime: { increment: Math.round(seconds) } },
      });
    } catch (error) {
      this.logger.error(`Failed to track watch time for ${postId}:`, error);
    }
  }

  /**
   * Retrieves aggregated statistics for a creator's dashboard.
   */
  async getCreatorDashboard(userId: string, days = 30) {
    // 0. Force live sync of today's metrics before querying
    await this.performDailyAggregation(userId);

    const startDate = subDays(startOfDay(new Date()), days);

    // 1. Get daily metrics
    const metrics = await this.prisma.userMetric.findMany({
      where: {
        userId,
        date: { gte: startDate },
      },
      orderBy: { date: 'asc' },
    });

    // 2. Get current lifetime stats
    const [posts, followers, totalLikes] = await Promise.all([
      this.prisma.post.count({ where: { userId } }),
      this.prisma.follow.count({
        where: { followingId: userId, status: 'ACCEPTED' },
      }),
      this.prisma.like.count({ where: { post: { userId } } }),
    ]);

    // 3. Calculate recent engagement
    // We look at posts from the last 30 days
    const recentPosts = await this.prisma.post.findMany({
      where: {
        userId,
        createdAt: { gte: startDate },
      },
      select: {
        id: true,
        views: true,
        _count: {
          select: {
            likes: true,
            comments: true,
            bookmarks: true,
          },
        },
      },
    });

    const totalViews = recentPosts.reduce((acc, p) => acc + p.views, 0);
    const totalEngagement = recentPosts.reduce(
      (acc, p) => acc + p._count.likes + p._count.comments + p._count.bookmarks,
      0,
    );

    const engagementRate =
      totalViews > 0 ? (totalEngagement / totalViews) * 100 : 0;

    return {
      summary: {
        totalPosts: posts,
        totalFollowers: followers,
        totalLikes,
        engagementRate: parseFloat(engagementRate.toFixed(2)),
        totalViews30d: totalViews,
      },
      charts: {
        dailyMetrics: metrics.map((m: any) => ({
          date: format(m.date, 'yyyy-MM-dd'),
          followers: m.followers,
          views: m.views,
          reach: m.reach,
        })),
      },
      recentPerformance: recentPosts.map((p) => ({
        id: p.id,
        views: p.views,
        likes: p._count.likes,
        comments: p._count.comments,
        engagement: p._count.likes + p._count.comments + p._count.bookmarks,
      })),
    };
  }

  /**
   * Task to take a daily snapshot of user metrics.
   * This should be called by a cron job or at the end of the day.
   */
  async performDailyAggregation(userId: string) {
    const today = startOfDay(new Date());

    const [followers, following, posts, likes, views] = await Promise.all([
      this.prisma.follow.count({
        where: { followingId: userId, status: 'ACCEPTED' },
      }),
      this.prisma.follow.count({
        where: { followerId: userId, status: 'ACCEPTED' },
      }),
      this.prisma.post.count({ where: { userId } }),
      this.prisma.like.count({ where: { post: { userId } } }),
      this.prisma.post.aggregate({
        where: { userId },
        _sum: { views: true },
      }),
    ]);

    await this.prisma.userMetric.upsert({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
      create: {
        userId,
        date: today,
        followers,
        following,
        posts,
        likes,
        views: views._sum.views || 0,
        reach: views._sum.views || 0, // Simplified for now
      },
      update: {
        followers,
        following,
        posts,
        likes,
        views: views._sum.views || 0,
        reach: (views._sum.views || 0) + likes, // Improved reach calculation (views + engagement)
      },
    });
  }

  /**
   * Detailed metrics for a specific post.
   */
  async getPostInsights(postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        caption: true,
        createdAt: true,
        views: true,
        loops: true,
        watchTime: true,
        _count: {
          select: {
            likes: true,
            comments: true,
            bookmarks: true,
          },
        },
      },
    });

    if (!post) throw new Error('Post not found');

    // Get daily views for this post from detailed PostView records
    const dailyViews = await this.prisma.postView.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
    });

    // Group by day
    const viewsByDay: Record<string, number> = {};
    for (const v of dailyViews) {
      const day = format(v.createdAt, 'yyyy-MM-dd');
      viewsByDay[day] = (viewsByDay[day] || 0) + 1;
    }

    // Fetch interaction events for this post to get more detailed metrics
    const interactionEvents = await this.prisma.interactionEvent.findMany({
      where: {
        targetId: postId,
        targetType: 'POST',
      },
      select: {
        eventType: true,
        dwellTime: true,
      },
    });

    const impressions = interactionEvents.filter(
      (e) => e.eventType === 'IMPRESSION',
    ).length;

    const shares = interactionEvents.filter(
      (e) => e.eventType === 'SHARE',
    ).length;

    const totalDwellMs = interactionEvents
      .filter((e) => e.eventType === 'DWELL_TIME' && e.dwellTime)
      .reduce((acc, e) => acc + (e.dwellTime || 0), 0);
    const totalDwellTime = Math.round(totalDwellMs / 1000);

    const totalViews = post.views;
    const likesCount = post._count.likes;
    const commentsCount = post._count.comments;
    const bookmarksCount = post._count.bookmarks;
    const totalInteractions = likesCount + commentsCount + bookmarksCount;

    const conversionRate =
      totalViews > 0
        ? Math.round((totalInteractions / totalViews) * 100 * 10) / 10
        : 0;

    return {
      post: {
        ...post,
        impressions,
        shares,
        totalDwellTime,
        conversionRate,
      },
      chart: Object.entries(viewsByDay).map(([date, count]) => ({
        date,
        views: count,
      })),
    };
  }
}
