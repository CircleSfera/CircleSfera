import { Inject, Injectable } from '@nestjs/common';
import { PromotionStatus } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service.js';

interface PostViewsAggregation {
  _sum: { views: number | null };
}

interface RecentInteraction {
  createdAt: Date;
}

const WEEKDAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

@Injectable()
export class GetCreatorStatsQuery {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(profileId: string) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { userId: true },
    });
    const userId = profile?.userId;

    const results = await Promise.all([
      this.prisma.post.count({
        where: { profileId, type: 'POST', deletedAt: null },
      }),
      this.prisma.post.count({
        where: { profileId, type: 'FRAME', deletedAt: null },
      }),
      this.prisma.story.count({ where: { profileId, deletedAt: null } }),
      this.prisma.follow.count({
        where: { followingId: profileId, status: 'ACCEPTED' },
      }),
      this.prisma.follow.count({
        where: {
          followingId: profileId,
          status: 'ACCEPTED',
          createdAt: { lt: sevenDaysAgo },
        },
      }),
      this.prisma.like.count({
        where: { post: { profileId, deletedAt: null } },
      }),
      this.prisma.comment.count({
        where: { post: { profileId, deletedAt: null } },
      }),
      this.prisma.bookmark.count({
        where: { post: { profileId, deletedAt: null } },
      }),
      userId
        ? this.prisma.promotion.count({
            where: { userId, status: PromotionStatus.ACTIVE },
          })
        : Promise.resolve(0),
      this.prisma.post.aggregate({
        where: { profileId, deletedAt: null },
        _sum: {
          views: true,
        },
      }) as unknown as Promise<PostViewsAggregation>,
      this.prisma.storyView.count({
        where: { story: { profileId, deletedAt: null } },
      }),
      this.prisma.like.findMany({
        where: {
          post: { profileId, deletedAt: null },
          createdAt: { gte: sevenDaysAgo },
        },
        select: { createdAt: true },
      }),
      this.prisma.follow.count({
        where: { followerId: profileId, status: 'ACCEPTED' },
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

    // The day as a code the app writes in the reader's language; none when
    // the last week had no likes. Days and hours are in universal time.
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    recentLikes.forEach((l) => {
      dayCounts[new Date(l.createdAt).getUTCDay()]++;
    });

    const maxLikes = Math.max(...dayCounts);
    const bestDay = maxLikes > 0 ? WEEKDAYS[dayCounts.indexOf(maxLikes)] : null;

    const hourCounts = Array(24).fill(0);
    recentLikes.forEach((l) => {
      hourCounts[new Date(l.createdAt).getUTCHours()]++;
    });
    const maxHourLikes = Math.max(...hourCounts);
    const bestHour = maxHourLikes > 0 ? hourCounts.indexOf(maxHourLikes) : 0;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activeFollowersCount = await this.prisma.follow.count({
      where: {
        followingId: profileId,
        status: 'ACCEPTED',
        follower: {
          OR: [
            {
              likes: {
                some: {
                  post: { profileId },
                  createdAt: { gte: thirtyDaysAgo },
                },
              },
            },
            {
              comments: {
                some: {
                  post: { profileId },
                  createdAt: { gte: thirtyDaysAgo },
                },
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

    const followersList = await this.prisma.follow.findMany({
      where: { followingId: profileId, status: 'ACCEPTED' },
      select: {
        follower: {
          select: {
            location: true,
            userId: true,
          },
        },
      },
    });

    const locationCounts: Record<string, number> = {};
    for (const item of followersList) {
      const loc = item.follower.location || 'Unknown';
      locationCounts[loc] = (locationCounts[loc] || 0) + 1;
    }

    const geoDistribution = Object.entries(locationCounts).map(
      ([location, count]) => ({
        location,
        count,
      }),
    );

    // When the followers are active: their events are kept by person
    // (User.id), not by Profile.
    const followerUserIds = [
      ...new Set(followersList.map((f) => f.follower.userId)),
    ];
    let activityHours: { hour: number; count: number }[] = [];

    if (followerUserIds.length > 0) {
      const recentEvents = await this.prisma.interactionEvent.findMany({
        where: {
          userId: { in: followerUserIds },
          createdAt: { gte: thirtyDaysAgo },
        },
        select: {
          createdAt: true,
        },
      });

      const hourlyCounts = Array(24).fill(0);
      for (const event of recentEvents) {
        const hour = new Date(event.createdAt).getUTCHours();
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
      geoDistribution,
      activityHours,
      insights: {
        bestDayToPost: bestDay,
        bestHourToPost: bestHour,
        retentionRate,
      },
    };
  }
}
