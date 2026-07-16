/** Trigger re-index */
import { Inject, Injectable } from '@nestjs/common';
import { PromotionStatus, PromotionTargetType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

// ─── Interfaces ──────────────────────────────────────────────────
interface PostViewsAggregation {
  _sum: { views: number | null };
}

interface RecentInteraction {
  createdAt: Date;
}

interface CreatorPost {
  id: string;
  caption: string | null;
  type: string;
  views: number;
  createdAt: Date;
  media: { url: string; type: string }[];
  _count: { likes: number; comments: number; bookmarks: number };
}

import { ConfigService } from '@nestjs/config';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { StripeService } from '../common/stripe/stripe.service.js';

@Injectable()
export class CreatorService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AnalyticsService)
    private readonly analyticsService: AnalyticsService,
    @Inject(StripeService) private readonly stripeService: StripeService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  // ─── Stats ──────────────────────────────────────────────────────

  async getStats(userId: string) {
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
      // Reach (Post views + Story views)
      this.prisma.post.aggregate({
        where: { userId },
        _sum: {
          views: true,
        },
      }) as unknown as Promise<PostViewsAggregation>,
      this.prisma.storyView.count({
        where: { story: { userId } },
      }),
      // Best time to post (Insights)
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

    // Calculate follower growth percentage
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

    // Calculate Most Active Day (Insights)
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

    // Calculate Retention Rate (Proxy: Followers who interacted in last 30 days)
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

    // Calculate monetization metrics (MRR, Subscribers & Retention Status)
    const creatorSubscriptions = await this.prisma.creatorSubscription.findMany(
      {
        where: { creatorId: userId },
      },
    );

    const activeSubscriptions = creatorSubscriptions.filter(
      (sub) => sub.status === 'ACTIVE' && sub.expiresAt > new Date(),
    );

    const mrr =
      activeSubscriptions.reduce((acc, sub) => acc + sub.priceCents, 0) / 100;
    const subscriberCount = activeSubscriptions.length;

    const active = activeSubscriptions.filter((sub) => sub.autoRenew).length;
    const churning = activeSubscriptions.filter((sub) => !sub.autoRenew).length;
    const churned = creatorSubscriptions.filter(
      (sub) => sub.status !== 'ACTIVE' || sub.expiresAt <= new Date(),
    ).length;

    const retentionStatus = { active, churning, churned };

    // Calculate follower geo-distribution
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

    // Calculate follower activity hours from the last 30 days of interaction events
    const followerIds = followersList.map((f) => f.followerId);
    let activityHours: { hour: number; count: number }[] = [];

    if (followerIds.length > 0) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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

  // ─── Activity Chart ─────────────────────────────────────────────

  async getActivityChart(userId: string) {
    const dashboard = await this.analyticsService.getCreatorDashboard(
      userId,
      14,
    );
    return dashboard.charts.dailyMetrics;
  }

  // ─── Posts with Metrics ─────────────────────────────────────────

  async getPosts(userId: string, page = 1, limit = 10, type?: string) {
    const where = {
      userId,
      ...(type ? { type: type as 'POST' | 'FRAME' } : {}),
    };

    // Calculate Average Interactions for the user to determine performance
    const [stats, postsResult, total] = await Promise.all([
      this.getStats(userId),
      this.prisma.post.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          caption: true,
          type: true,
          views: true,
          createdAt: true,
          media: { take: 1, select: { url: true, type: true } },
          _count: {
            select: { likes: true, comments: true, bookmarks: true },
          },
        },
      }) as unknown as Promise<CreatorPost[]>,
      this.prisma.post.count({ where }),
    ]);

    const avgInteractions =
      (stats.totalLikes + stats.totalComments) /
      (stats.postCount + stats.frameCount || 1);

    const data = postsResult.map((post) => {
      const interactions =
        (post._count?.likes || 0) + (post._count?.comments || 0);

      const avg = avgInteractions > 0 ? avgInteractions : 0;
      const performanceScore =
        avg > 0 ? Math.round((interactions / avg) * 100) : 100;

      return {
        ...post,
        performanceScore,
      };
    });

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Stories with Metrics ───────────────────────────────────────

  async getStories(userId: string, page = 1, limit = 10) {
    const [data, total] = await Promise.all([
      this.prisma.story.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          url: true,
          mediaType: true,
          expiresAt: true,
          createdAt: true,
          _count: { select: { views: true, reactions: true } },
        },
      }),
      this.prisma.story.count({ where: { userId } }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Promotions ─────────────────────────────────────────────────

  async getPromotions(userId: string, page = 1, limit = 10) {
    // 1. Auto-mark expired active promotions as completed
    await this.prisma.promotion.updateMany({
      where: {
        userId,
        status: PromotionStatus.ACTIVE,
        endDate: { lt: new Date() },
      },
      data: { status: PromotionStatus.COMPLETED },
    });

    // 2. Delete all cancelled promotions (cleanup)
    await this.prisma.promotion.deleteMany({
      where: { userId, status: PromotionStatus.CANCELLED },
    });

    // 3. Fetch only active + completed + pending, with related post/story data
    const where = {
      userId,
      status: {
        in: [
          PromotionStatus.ACTIVE,
          PromotionStatus.COMPLETED,
          PromotionStatus.PENDING,
        ],
      },
    };

    const [data, total] = await Promise.all([
      this.prisma.promotion.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], // active first
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.promotion.count({ where }),
    ]);

    // 4. Enrich with post/story thumbnail data
    const enriched = await Promise.all(
      data.map(async (promo) => {
        let target: {
          caption?: string | null;
          thumbnail?: string | null;
          type?: string;
        } | null = null;

        if (promo.targetType === PromotionTargetType.POST) {
          const post = await this.prisma.post.findUnique({
            where: { id: promo.targetId },
            select: {
              caption: true,
              type: true,
              media: { take: 1, select: { url: true, type: true } },
            },
          });
          if (post) {
            target = {
              caption: post.caption,
              thumbnail: post.media?.[0]?.url || null,
              type: post.type,
            };
          }
        } else if (promo.targetType === PromotionTargetType.STORY) {
          const story = await this.prisma.story.findUnique({
            where: { id: promo.targetId },
            select: { url: true, mediaType: true },
          });
          if (story) {
            target = {
              caption: null,
              thumbnail: story.url,
              type: 'STORY',
            };
          }
        } else if (promo.targetType === PromotionTargetType.PROFILE) {
          const profile = await this.prisma.profile.findUnique({
            where: { userId: promo.targetId },
            select: { username: true, avatar: true },
          });
          if (profile) {
            target = {
              caption: profile.username,
              thumbnail: profile.avatar,
              type: 'PROFILE',
            };
          }
        }

        return { ...promo, target };
      }),
    );

    return {
      data: enriched,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async createPromotion(
    userId: string,
    targetType: string,
    targetId: string,
    durationDays: number,
    budget?: number,
    currency = 'EUR',
    objective = 'PROFILE_VISITS',
    interests?: string,
    countries?: string,
    dailyBudget?: number,
  ) {
    // 1. Validate ownership
    if (targetType === 'post' || targetType === 'frame') {
      const post = await this.prisma.post.findFirst({
        where: { id: targetId, userId },
      });
      if (!post) throw new Error('Post not found or not owned by user');
    } else if (targetType === 'story') {
      const story = await this.prisma.story.findFirst({
        where: { id: targetId, userId },
      });
      if (!story) throw new Error('Story not found or not owned by user');
    } else if (targetType === 'profile') {
      if (targetId !== userId)
        throw new Error('Cannot promote other users profile');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, stripeCustomerId: true },
    });

    if (!user) throw new Error('User not found');

    const typeMap: Record<string, PromotionTargetType> = {
      post: PromotionTargetType.POST,
      frame: PromotionTargetType.POST,
      story: PromotionTargetType.STORY,
      profile: PromotionTargetType.PROFILE,
    };

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + durationDays);

    const finalBudget =
      budget || (dailyBudget ? dailyBudget * durationDays : 0);

    const promotion = await this.prisma.promotion.create({
      data: {
        userId,
        targetType:
          typeMap[targetType.toLowerCase()] || PromotionTargetType.POST,
        targetId,
        budget: finalBudget,
        dailyBudget,
        currency,
        endDate,
        objective,
        interests,
        countries,
        status: PromotionStatus.PENDING,
      },
    });

    // 2. Create Stripe Checkout Session
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    const session = await this.stripeService.createCheckoutSession({
      customer: user.stripeCustomerId || undefined,
      customer_email: user.stripeCustomerId ? undefined : user.email,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `Promotion: ${targetType.toUpperCase()}`,
              description: `Boost for ${durationDays} days`,
            },
            unit_amount: Math.round(finalBudget * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${frontendUrl}/creator?promotion=success&id=${promotion.id}`,
      cancel_url: `${frontendUrl}/creator?promotion=cancelled`,
      metadata: {
        promotionId: promotion.id,
        userId: userId,
        type: 'PROMOTION',
      },
    });

    // 3. Update promotion with session ID
    await this.prisma.promotion.update({
      where: { id: promotion.id },
      data: { stripePaymentIntentId: session.id },
    });

    return {
      url: session.url,
      promotionId: promotion.id,
    };
  }

  async recordPromotionView(promotionId: string) {
    const promo = await this.prisma.promotion.findUnique({
      where: { id: promotionId },
    });

    if (!promo || promo.status !== PromotionStatus.ACTIVE) {
      return { success: false };
    }

    const COST_PER_VIEW = 0.01;
    const newBudget = promo.budget - COST_PER_VIEW;

    if (newBudget <= 0) {
      await this.prisma.promotion.update({
        where: { id: promotionId },
        data: {
          reach: { increment: 1 },
          budget: 0,
          status: PromotionStatus.COMPLETED,
        },
      });
    } else {
      await this.prisma.promotion.update({
        where: { id: promotionId },
        data: {
          reach: { increment: 1 },
          budget: newBudget,
        },
      });
    }

    return { success: true };
  }

  async cancelPromotion(userId: string, promotionId: string) {
    const promo = await this.prisma.promotion.findFirst({
      where: { id: promotionId, userId },
    });
    if (!promo) throw new Error('Promotion not found');
    if (promo.status === PromotionStatus.COMPLETED) {
      throw new Error('Cannot cancel completed promotion');
    }

    // Permanently delete cancelled promotions
    return this.prisma.promotion.delete({
      where: { id: promotionId },
    });
  }
}
