import { Inject, Injectable } from '@nestjs/common';
import { PromotionStatus } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service.js';

interface PostViewsAggregation {
  _sum: { views: number | null };
}

interface RecentInteraction {
  createdAt: Date;
}

@Injectable()
export class GetCreatorStatsQuery {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(userId: string) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const results = await Promise.all([
      this.prisma.post.count({
        where: { userId, type: 'POST' },
      }),
      this.prisma.post.count({
        where: { userId, type: 'FRAME' },
      }),
      this.prisma.story.count({ where: { userId } }),
      this.prisma.follow.count({
        where: { followingId: userId, status: 'ACCEPTED' },
      }),
      this.prisma.follow.count({
        where: {
          followingId: userId,
          status: 'ACCEPTED',
          createdAt: { lt: sevenDaysAgo },
        },
      }),
      this.prisma.like.count({
        where: { post: { userId } },
      }),
      this.prisma.comment.count({
        where: { post: { userId } },
      }),
      this.prisma.bookmark.count({
        where: { post: { userId } },
      }),
      this.prisma.promotion.count({
        where: { userId, status: PromotionStatus.ACTIVE },
      }),
      this.prisma.post.aggregate({
        where: { userId },
        _sum: {
          views: true,
        },
      }) as unknown as Promise<PostViewsAggregation>,
      this.prisma.storyView.count({
        where: { story: { userId } },
      }),
      this.prisma.like.findMany({
        where: { post: { userId }, createdAt: { gte: sevenDaysAgo } },
        select: { createdAt: true },
      }),
      this.prisma.follow.count({
        where: { followerId: userId, status: 'ACCEPTED' },
      }),
    ]);

    const postCount = results[0];
    const frameCount = results[1];
    const storyCount = results[2];
    const followerCount = results[3];
    const followerCount7DaysAgo = results[4];
    const totalLikes = results[5];
    const totalComments = results[6];
    const totalBookmarks = results[7];
    const activePromotions = results[8];
    const postViews = results[9]?._sum?.views || 0;
    const storyViews = results[10];
    const recentLikes = results[11] as RecentInteraction[];
    const followingCount = results[12];

    const totalReach = postViews + storyViews;

    const followerGrowth =
      followerCount7DaysAgo > 0
        ? Math.round(
            ((followerCount - followerCount7DaysAgo) / followerCount7DaysAgo) *
              100 *
              10,
          ) / 10
        : 0;

    const engagementRate =
      followerCount > 0
        ? Math.round(
            ((totalLikes + totalComments) /
              (postCount + frameCount || 1) /
              followerCount) *
              100 *
              100,
          ) / 100
        : 0;

    const daysArr = [
      'Domingos',
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábados',
    ];
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    recentLikes.forEach((l) => {
      dayCounts[new Date(l.createdAt).getDay()]++;
    });

    const maxLikes = Math.max(...dayCounts);
    const bestDayIndex = maxLikes > 0 ? dayCounts.indexOf(maxLikes) : 0;
    const bestDay = daysArr[bestDayIndex];

    const hourCounts = Array(24).fill(0);
    recentLikes.forEach((l) => {
      hourCounts[new Date(l.createdAt).getHours()]++;
    });
    const maxHourLikes = Math.max(...hourCounts);
    const bestHour = maxHourLikes > 0 ? hourCounts.indexOf(maxHourLikes) : 0;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activeFollowersCount = await this.prisma.follow.count({
      where: {
        followingId: userId,
        status: 'ACCEPTED',
        follower: {
          OR: [
            {
              likes: {
                some: { post: { userId }, createdAt: { gte: thirtyDaysAgo } },
              },
            },
            {
              comments: {
                some: { post: { userId }, createdAt: { gte: thirtyDaysAgo } },
              },
            },
          ],
        },
      },
    });

    const retentionRate =
      followerCount > 0
        ? Math.round((activeFollowersCount / followerCount) * 100)
        : 0;

    const mrr = 0;
    const subscriberCount = 0;
    const active = 0;
    const churning = 0;
    const churned = 0;
    const retentionStatus = { active, churning, churned };

    const followersList = await this.prisma.follow.findMany({
      where: { followingId: userId, status: 'ACCEPTED' },
      select: {
        followerId: true,
        follower: {
          select: {
            profile: {
              select: {
                location: true,
              },
            },
          },
        },
      },
    });

    const locationCounts: Record<string, number> = {};
    for (const item of followersList) {
      const loc = item.follower.profile?.location || 'Unknown';
      locationCounts[loc] = (locationCounts[loc] || 0) + 1;
    }

    const geoDistribution = Object.entries(locationCounts).map(
      ([location, count]) => ({
        location,
        count,
      }),
    );

    const followerIds = followersList.map((f) => f.followerId);
    let activityHours: { hour: number; count: number }[] = [];

    if (followerIds.length > 0) {
      const recentEvents = await this.prisma.interactionEvent.findMany({
        where: {
          userId: { in: followerIds },
          createdAt: { gte: thirtyDaysAgo },
        },
        select: {
          createdAt: true,
        },
      });

      const hourlyCounts = Array(24).fill(0);
      for (const event of recentEvents) {
        const hour = new Date(event.createdAt).getHours();
        hourlyCounts[hour]++;
      }

      activityHours = hourlyCounts.map((count, hour) => ({
        hour,
        count,
      }));
    } else {
      activityHours = Array(24)
        .fill(0)
        .map((_, hour) => ({
          hour,
          count: 0,
        }));
    }

    return {
      postCount,
      frameCount,
      storyCount,
      followerCount,
      followingCount,
      totalLikes,
      totalComments,
      totalBookmarks,
      activePromotions,
      engagementRate,
      followerGrowth,
      totalReach,
      mrr,
      subscriberCount,
      geoDistribution,
      activityHours,
      retentionStatus,
      insights: {
        bestDayToPost: bestDay,
        bestHourToPost: bestHour,
        retentionRate,
      },
    };
  }
}
