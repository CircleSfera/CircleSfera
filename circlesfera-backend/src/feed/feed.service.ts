import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { Visibility } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { AIService } from '../ai/ai.service.js';
import {
  createPaginatedResult,
  PaginationDto,
} from '../common/dto/pagination.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class FeedService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    // biome-ignore lint/correctness/noUnusedPrivateClassMembers: aiService injected for future use
    @Inject(AIService) private readonly aiService: AIService,
  ) {}

  /**
   * Generates a hybrid "For You" feed using an advanced mathematical algorithm.
   * Score = (AI_Similarity * 0.4) + (Social_Graph * 0.3) + (Popularity * 0.3) * Time_Decay
   */
  async getHybridFeed(userId: string | null, pagination: PaginationDto) {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    // 1. If not logged in, return a trending chronological feed
    if (!userId) {
      return this.getTrendingFeed(page, limit, skip);
    }

    const cacheKey = `feed:hybrid:user_${userId}:page_${page}:limit_${limit}`;
    const cachedFeed = await this.cacheManager.get(cacheKey);
    if (cachedFeed) {
      return cachedFeed;
    }

    // 2. Logged in: Build Hybrid Feed
    try {
      // Step A: Calculate the User's Average Vector Preference based on recent likes
      const lastLikes = await this.prisma.like.findMany({
        where: { userId },
        take: 20,
        orderBy: { createdAt: 'desc' },
        select: { postId: true },
      });

      const likedPostIds = lastLikes.map((l) => l.postId);

      // If no likes, we skip vector search to avoid null vectors.
      let targetVectorStr = '';

      if (likedPostIds.length > 0) {
        // We get the embedding of the most recently liked post
        // (A more advanced approach averages the vectors, but pgvector makes it easier to just use the first for now)
        const likedPosts = (await this.prisma.post.findMany({
          where: { id: { in: likedPostIds }, embedding: { not: null } as any },
          select: { embedding: true },
          take: 1,
        })) as any[];

        if (likedPosts.length > 0 && likedPosts[0].embedding) {
          targetVectorStr = likedPosts[0].embedding;
        }
      }

      // Step B: Execute the Hybrid SQL Query
      // We use $queryRaw to combine vector distance, time decay, and social relationships

      let postsRaw: any[] = [];

      if (targetVectorStr) {
        // Hybrid Query WITH AI Vector
        postsRaw = await this.prisma.$queryRaw`
          WITH social_graph_raw AS (
            SELECT "followingId", 1.5 AS weight
            FROM "follows"
            WHERE "followerId" = ${userId} AND "status" = 'ACCEPTED'
            UNION ALL
            SELECT "friendId" AS "followingId", 2.0 AS weight
            FROM "close_friends"
            WHERE "userId" = ${userId}
          ),
          social_graph AS (
            SELECT "followingId", MAX(weight) as weight FROM social_graph_raw GROUP BY "followingId"
          )
          SELECT 
            p.id,
            -- AI Similarity (0 to 1)
            (1 - (pe.vector <=> ${targetVectorStr}::vector)) AS ai_score,
            
            -- Time Decay: Exponential decay based on days since creation
            EXP(-EXTRACT(EPOCH FROM (NOW() - p."createdAt")) / 86400.0) AS time_decay,
            
            -- Social Graph Weight
            COALESCE(sg.weight, 1.0) AS social_weight,
            
            -- Final Hybrid Score Calculation
            (
              ((1 - (pe.vector <=> ${targetVectorStr}::vector)) * 0.4) +
              (COALESCE(sg.weight, 1.0) * 0.3) +
              (COALESCE(p."performanceScore", 0) * 0.3)
            ) * EXP(-EXTRACT(EPOCH FROM (NOW() - p."createdAt")) / 86400.0) AS final_score
            
          FROM "posts" p
          JOIN "post_embeddings" pe ON p.id = pe."postId"
          LEFT JOIN social_graph sg ON p."userId" = sg."followingId"
          
          WHERE p.visibility = 'PUBLIC'
            AND p."moderationStatus" = 'VISIBLE'
            AND p."userId" != ${userId}
            AND p.id NOT IN (SELECT "postId" FROM "likes" WHERE "userId" = ${userId})
            AND p."userId" NOT IN (SELECT "mutedId" FROM "mutes" WHERE "muterId" = ${userId})
            AND p."userId" NOT IN (SELECT "blockedId" FROM "blocks" WHERE "blockerId" = ${userId})
            AND p."userId" NOT IN (SELECT "blockerId" FROM "blocks" WHERE "blockedId" = ${userId})
            
          ORDER BY final_score DESC
          LIMIT ${limit}
          OFFSET ${skip}
        `;
      } else {
        // Hybrid Query WITHOUT AI Vector (User has no likes yet)
        postsRaw = await this.prisma.$queryRaw`
          WITH social_graph_raw AS (
            SELECT "followingId", 1.5 AS weight
            FROM "follows"
            WHERE "followerId" = ${userId} AND "status" = 'ACCEPTED'
            UNION ALL
            SELECT "friendId" AS "followingId", 2.0 AS weight
            FROM "close_friends"
            WHERE "userId" = ${userId}
          ),
          social_graph AS (
            SELECT "followingId", MAX(weight) as weight FROM social_graph_raw GROUP BY "followingId"
          )
          SELECT 
            p.id,
            -- Time Decay
            EXP(-EXTRACT(EPOCH FROM (NOW() - p."createdAt")) / 86400.0) AS time_decay,
            
            -- Social Graph Weight
            COALESCE(sg.weight, 1.0) AS social_weight,
            
            -- Final Hybrid Score Calculation (Without AI)
            (
              (COALESCE(sg.weight, 1.0) * 0.5) +
              (COALESCE(p."performanceScore", 0) * 0.5)
            ) * EXP(-EXTRACT(EPOCH FROM (NOW() - p."createdAt")) / 86400.0) AS final_score
            
          FROM "posts" p
          LEFT JOIN social_graph sg ON p."userId" = sg."followingId"
          
          WHERE p.visibility = 'PUBLIC'
            AND p."moderationStatus" = 'VISIBLE'
            AND p."userId" != ${userId}
            AND p."userId" NOT IN (SELECT "mutedId" FROM "mutes" WHERE "muterId" = ${userId})
            AND p."userId" NOT IN (SELECT "blockedId" FROM "blocks" WHERE "blockerId" = ${userId})
            AND p."userId" NOT IN (SELECT "blockerId" FROM "blocks" WHERE "blockedId" = ${userId})
            
          ORDER BY final_score DESC
          LIMIT ${limit}
          OFFSET ${skip}
        `;
      }

      if (postsRaw.length === 0) {
        return this.getTrendingFeed(page, limit, skip, userId);
      }

      // Step C: Hydrate Post objects with full relations
      const postIds = postsRaw.map((p) => p.id);
      const hydratedPosts = await this.prisma.post.findMany({
        where: { id: { in: postIds } },
        include: {
          user: { include: { profile: true } },
          media: true,
          _count: { select: { likes: true, comments: true } },
          likes: { where: { userId }, take: 1 },
        },
      });

      // Sort back to algorithm order
      const sortedPosts = postIds
        .map((id) => hydratedPosts.find((p) => p.id === id))
        .filter(Boolean);

      // Fetch user's subscriptions and unlocked posts
      let subscribedCreatorIds = new Set<string>();
      let unlockedPostIds = new Set<string>();

      if (userId) {
        const [subs, unlocks] = await Promise.all([
          this.prisma.creatorSubscription.findMany({
            where: { subscriberId: userId, status: 'ACTIVE' },
            select: { creatorId: true },
          }),
          this.prisma.postUnlock.findMany({
            where: { userId },
            select: { postId: true },
          }),
        ]);
        subscribedCreatorIds = new Set(subs.map((s) => s.creatorId));
        unlockedPostIds = new Set(unlocks.map((u) => u.postId));
      }

      const formattedPosts = sortedPosts.map((post: any) => {
        const { likes, ...rest } = post;
        const isLiked = Array.isArray(likes) ? likes.length > 0 : false;

        // Attach algorithm reasoning score for debugging
        const rawData = postsRaw.find((r) => r.id === post.id);

        let finalPost = {
          ...rest,
          isLiked,
          algScore: rawData?.final_score,
        };

        if (finalPost.isPremium && finalPost.userId !== userId) {
          const isSubscribed = subscribedCreatorIds.has(finalPost.userId);
          const isUnlocked = unlockedPostIds.has(finalPost.id);

          if (!isSubscribed && !isUnlocked) {
            finalPost = {
              ...finalPost,
              isLocked: true,
              media: finalPost.media?.map((m: any) => ({
                ...m,
                url: '',
                standardUrl: '',
              })),
            };
          }
        }

        return finalPost;
      });

      const feedWithPromotions = await this.injectPromotions(formattedPosts, userId);

      // Simple mock total since accurate counts are heavy for algorithmic feeds
      const result = createPaginatedResult(feedWithPromotions, 1000, page, limit);

      // Save to cache for 3 minutes (180000 ms)
      await this.cacheManager.set(cacheKey, result, 180000);

      return result;
    } catch (error) {
      console.error('Error generating Hybrid Feed:', error);
      return this.getTrendingFeed(page, limit, skip, userId);
    }
  }

  /**
   * Chronological feed from Followed users
   */
  async getFollowingFeed(userId: string, pagination: PaginationDto) {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const [following, mutes] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followerId: userId, status: 'ACCEPTED' },
        select: { followingId: true },
      }),
      this.prisma.mute.findMany({
        where: { muterId: userId },
        select: { mutedId: true },
      }),
    ]);

    const mutedIds = new Set(mutes.map((m) => m.mutedId));
    const followingIds = following
      .map((f) => f.followingId)
      .filter((id) => !mutedIds.has(id));

    followingIds.push(userId); // Include own posts

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where: {
          userId: { in: followingIds },
          type: 'POST',
          moderationStatus: { in: ['VISIBLE', 'FLAGGED'] },
          OR: [
            { visibility: Visibility.PUBLIC },
            { visibility: Visibility.FOLLOWERS },
            { userId: userId },
          ],
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { include: { profile: true } },
          media: true,
          _count: { select: { likes: true, comments: true } },
          likes: { where: { userId }, take: 1 },
        },
      }),
      this.prisma.post.count({
        where: {
          userId: { in: followingIds },
          type: 'POST',
          moderationStatus: { in: ['VISIBLE', 'FLAGGED'] },
        },
      }),
    ]);

    let subscribedCreatorIds = new Set<string>();
    let unlockedPostIds = new Set<string>();

    if (userId) {
      const [subs, unlocks] = await Promise.all([
        this.prisma.creatorSubscription.findMany({
          where: { subscriberId: userId, status: 'ACTIVE' },
          select: { creatorId: true },
        }),
        this.prisma.postUnlock.findMany({
          where: { userId },
          select: { postId: true },
        }),
      ]);
      subscribedCreatorIds = new Set(subs.map((s) => s.creatorId));
      unlockedPostIds = new Set(unlocks.map((u) => u.postId));
    }

    const formattedPosts = posts.map((post: any) => {
      const { likes, ...rest } = post;
      const isLiked = Array.isArray(likes) ? likes.length > 0 : false;
      
      let finalPost = { ...rest, isLiked };

      if (finalPost.isPremium && finalPost.userId !== userId) {
        const isSubscribed = subscribedCreatorIds.has(finalPost.userId);
        const isUnlocked = unlockedPostIds.has(finalPost.id);

        if (!isSubscribed && !isUnlocked) {
          finalPost = {
            ...finalPost,
            isLocked: true,
            media: finalPost.media?.map((m: any) => ({
              ...m,
              url: '',
              standardUrl: '',
            })),
          };
        }
      }

      return finalPost;
    });

    const feedWithPromotions = await this.injectPromotions(formattedPosts, userId);

    return createPaginatedResult(feedWithPromotions, total, page, limit);
  }

  /**
   * Fallback / Trending feed logic
   */
  private async getTrendingFeed(
    page: number,
    limit: number,
    skip: number,
    currentUserId?: string | null,
  ) {
    const cacheKey = `feed:trending:user_${currentUserId || 'guest'}:page_${page}:limit_${limit}`;
    const cachedFeed = await this.cacheManager.get(cacheKey);
    if (cachedFeed) {
      return cachedFeed;
    }

    let mutedIds: string[] = [];
    if (currentUserId) {
      const mutes = await this.prisma.mute.findMany({
        where: { muterId: currentUserId },
        select: { mutedId: true },
      });
      mutedIds = mutes.map((m) => m.mutedId);
    }

    const posts = await this.prisma.post.findMany({
      where: {
        visibility: Visibility.PUBLIC,
        moderationStatus: 'VISIBLE',
        ...(mutedIds.length > 0 ? { userId: { notIn: mutedIds } } : {}),
      },
      orderBy: [{ performanceScore: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
      include: {
        user: { include: { profile: true } },
        media: true,
        _count: { select: { likes: true, comments: true } },
        likes: currentUserId
          ? { where: { userId: currentUserId }, take: 1 }
          : false,
      },
    });

    let subscribedCreatorIds = new Set<string>();
    let unlockedPostIds = new Set<string>();

    if (currentUserId) {
      const [subs, unlocks] = await Promise.all([
        this.prisma.creatorSubscription.findMany({
          where: { subscriberId: currentUserId, status: 'ACTIVE' },
          select: { creatorId: true },
        }),
        this.prisma.postUnlock.findMany({
          where: { userId: currentUserId },
          select: { postId: true },
        }),
      ]);
      subscribedCreatorIds = new Set(subs.map((s) => s.creatorId));
      unlockedPostIds = new Set(unlocks.map((u) => u.postId));
    }

    const formattedPosts = posts.map((post: any) => {
      const { likes, ...rest } = post;
      const isLiked =
        currentUserId && Array.isArray(likes) ? likes.length > 0 : false;
      
      let finalPost = { ...rest, isLiked };

      if (finalPost.isPremium && finalPost.userId !== currentUserId) {
        const isSubscribed = subscribedCreatorIds.has(finalPost.userId);
        const isUnlocked = unlockedPostIds.has(finalPost.id);

        if (!isSubscribed && !isUnlocked) {
          finalPost = {
            ...finalPost,
            isLocked: true,
            media: finalPost.media?.map((m: any) => ({
              ...m,
              url: '',
              standardUrl: '',
            })),
          };
        }
      }

      return finalPost;
    });

    const feedWithPromotions = await this.injectPromotions(formattedPosts, currentUserId);

    const result = createPaginatedResult(feedWithPromotions, 1000, page, limit);

    // Save to cache for 5 minutes (300000 ms)
    await this.cacheManager.set(cacheKey, result, 300000);

    return result;
  }

  /**
   * Helper to inject active promotions into a feed
   */
  private async injectPromotions(posts: any[], userId?: string | null) {
    if (posts.length === 0) return posts;

    // We want to inject 1 promotion every 5 posts.
    const neededPromotions = Math.floor(posts.length / 5);
    if (neededPromotions === 0) return posts;

    const activePromotions = await this.prisma.promotion.findMany({
      where: {
        status: 'ACTIVE',
        targetType: 'POST',
        budget: { gt: 0 },
        endDate: { gt: new Date() },
        ...(userId ? { userId: { not: userId } } : {}),
      },
      take: neededPromotions,
      orderBy: { createdAt: 'desc' }
    });

    if (activePromotions.length === 0) return posts;

    const promotedPostIds = activePromotions.map(p => p.targetId);
    const promotedPostsRaw = await this.prisma.post.findMany({
      where: { id: { in: promotedPostIds } },
      include: {
        user: { include: { profile: true } },
        media: true,
        _count: { select: { likes: true, comments: true } },
        likes: userId ? { where: { userId }, take: 1 } : false,
      }
    });

    const promotedPostsDict = new Map();
    for (const p of promotedPostsRaw) {
      const { likes, ...rest } = p;
      const isLiked = userId && Array.isArray(likes) ? likes.length > 0 : false;
      promotedPostsDict.set(p.id, { ...rest, isLiked, isPromoted: true });
    }

    const finalPosts = [];
    let promoIndex = 0;
    
    for (let i = 0; i < posts.length; i++) {
      finalPosts.push(posts[i]);
      // Inject after every 5th post (index 4, 9, 14)
      if ((i + 1) % 5 === 0 && promoIndex < activePromotions.length) {
        const promo = activePromotions[promoIndex];
        const postToInject = promotedPostsDict.get(promo.targetId);
        if (postToInject) {
          finalPosts.push({ ...postToInject, promotionId: promo.id });
        }
        promoIndex++;
      }
    }

    return finalPosts;
  }
}
