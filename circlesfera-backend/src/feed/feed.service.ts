import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Visibility } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { AIService } from '../ai/ai.service.js';
import {
  createPaginatedResult,
  PaginationDto,
} from '../common/dto/pagination.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FeedInboxService } from './feed-inbox.service.js';
import { FeedPreferencesService } from './feed-preferences.service.js';

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    // biome-ignore lint/correctness/noUnusedPrivateClassMembers: aiService injected for future use
    @Inject(AIService) private readonly aiService: AIService,
    @Inject(FeedInboxService) private readonly feedInbox: FeedInboxService,
    @Inject(FeedPreferencesService)
    private readonly feedPreferences: FeedPreferencesService,
  ) {}

  private postHydrationInclude(profileId?: string | null) {
    return {
      profile: { include: { user: true } },
      media: true,
      poll: { select: { id: true } },
      qnaBox: { select: { id: true } },
      _count: { select: { likes: true, comments: true } },
      likes: profileId ? { where: { profileId }, take: 1 } : false,
    };
  }

  private async getViewerContentSettings(profileId: string | null) {
    if (!profileId) {
      return {
        allowMature: false,
        blurSensitiveContent: true,
      };
    }
    // UserSettings is keyed by account User.id, not Profile.id
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { userId: true },
    });
    if (!profile) {
      return {
        allowMature: false,
        blurSensitiveContent: true,
      };
    }
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId: profile.userId },
      select: {
        contentPreference: true,
        blurSensitiveContent: true,
      },
    });
    return {
      allowMature: settings?.contentPreference === 'MATURE',
      blurSensitiveContent: settings?.blurSensitiveContent ?? true,
    };
  }

  private buildRecommendationMeta(
    rawData: {
      social_weight?: number;
      ai_score?: number;
      final_score?: number;
    } | null,
    performanceScore: number,
    fallbackReason?: string,
  ) {
    const signals: string[] = [];
    let recommendationReason = fallbackReason || 'new';

    if (rawData) {
      if (rawData.social_weight === 2.0) {
        recommendationReason = 'close_friend';
        signals.push('close_friend');
      } else if (rawData.social_weight === 1.5) {
        recommendationReason = 'following';
        signals.push('following');
      }

      if (rawData.ai_score && Number(rawData.ai_score) > 0.65) {
        signals.push('interest_match');
        if (recommendationReason === 'new') {
          recommendationReason = 'interest';
        }
      }

      if (performanceScore > 20) {
        signals.push('high_engagement');
        if (recommendationReason === 'new') {
          recommendationReason = 'popular';
        }
      }

      if (rawData.final_score != null) {
        signals.push('ranked_for_you');
      }
    } else if (fallbackReason) {
      signals.push(fallbackReason);
    }

    if (signals.length === 0) {
      signals.push(recommendationReason);
    }

    return {
      recommendationReason,
      recommendationSignals: signals,
      algScore: rawData?.final_score,
    };
  }

  /**
   * Generates a hybrid "For You" feed using an advanced mathematical algorithm.
   * Score = (AI_Similarity * 0.4) + (Social_Graph * 0.3) + (Popularity * 0.3) * Time_Decay
   */
  async getHybridFeed(profileId: string | null, pagination: PaginationDto) {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    // 1. If not logged in, return a trending chronological feed
    if (!profileId) {
      return this.getTrendingFeed(page, limit, skip);
    }

    const viewerSettings = await this.getViewerContentSettings(profileId);
    const cacheKey = `feed:hybrid:user_${profileId}:page_${page}:limit_${limit}:mature_${viewerSettings.allowMature}`;
    const cachedFeed = await this.cacheManager.get(cacheKey);
    if (cachedFeed) {
      return cachedFeed;
    }

    // 2. Logged in: Build Hybrid Feed
    try {
      // Step A: Calculate the User's Average Vector Preference based on recent likes
      const lastLikes = await this.prisma.like.findMany({
        where: { profileId },
        take: 20,
        orderBy: { createdAt: 'desc' },
        select: { postId: true },
      });

      const likedPostIds = lastLikes.map((l) => l.postId);

      // If no likes, we skip vector search to avoid null vectors.
      let targetVectorStr = '';

      if (likedPostIds.length > 0) {
        // Embeddings live in post_embeddings (not on posts).
        const likedEmbeddings = await this.prisma.$queryRaw<
          { vector: string }[]
        >`
          SELECT pe.vector::text AS vector
          FROM "post_embeddings" pe
          WHERE pe."postId" = ANY(${likedPostIds}::text[])
          LIMIT 1
        `;

        if (likedEmbeddings[0]?.vector) {
          targetVectorStr = likedEmbeddings[0].vector;
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
            WHERE "followerId" = ${profileId} AND "status" = 'ACCEPTED'
            UNION ALL
            SELECT "friendId" AS "followingId", 2.0 AS weight
            FROM "close_friends"
            WHERE "profileId" = ${profileId}
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
              ((1.0 - EXP(-COALESCE(p."performanceScore", 0) / 100.0)) * 0.3)
            ) * EXP(-EXTRACT(EPOCH FROM (NOW() - p."createdAt")) / 86400.0) AS final_score
            
          FROM "posts" p
          JOIN "post_embeddings" pe ON p.id = pe."postId"
          LEFT JOIN social_graph sg ON p."profileId" = sg."followingId"
          
          WHERE (p.visibility = 'PUBLIC' OR (p.visibility = 'FOLLOWERS' AND sg.weight IS NOT NULL))
            AND p."moderationStatus" = 'VISIBLE'
            AND p."profileId" != ${profileId}
            AND p.id NOT IN (SELECT "postId" FROM "likes" WHERE "profileId" = ${profileId})
            AND p."profileId" NOT IN (SELECT "mutedId" FROM "mutes" WHERE "muterId" = ${profileId})
            AND p."profileId" NOT IN (SELECT "blockedId" FROM "blocks" WHERE "blockerId" = ${profileId})
            AND p."profileId" NOT IN (SELECT "blockerId" FROM "blocks" WHERE "blockedId" = ${profileId})
            AND p.id NOT IN (SELECT "postId" FROM "feed_hidden_posts" WHERE "profileId" = ${profileId})
            AND p."profileId" NOT IN (SELECT "authorId" FROM "feed_hidden_authors" WHERE "profileId" = ${profileId})
            AND NOT EXISTS (
              SELECT 1 FROM "feed_muted_keywords" fmk
              WHERE fmk."profileId" = ${profileId}
                AND p.caption IS NOT NULL
                AND POSITION(fmk.keyword IN LOWER(p.caption)) > 0
            )
            AND (${viewerSettings.allowMature} OR p."contentRating" = 'GENERAL')
            
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
            WHERE "followerId" = ${profileId} AND "status" = 'ACCEPTED'
            UNION ALL
            SELECT "friendId" AS "followingId", 2.0 AS weight
            FROM "close_friends"
            WHERE "profileId" = ${profileId}
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
              ((1.0 - EXP(-COALESCE(p."performanceScore", 0) / 100.0)) * 0.5)
            ) * EXP(-EXTRACT(EPOCH FROM (NOW() - p."createdAt")) / 86400.0) AS final_score
            
          FROM "posts" p
          LEFT JOIN social_graph sg ON p."profileId" = sg."followingId"
          
          WHERE (p.visibility = 'PUBLIC' OR (p.visibility = 'FOLLOWERS' AND sg.weight IS NOT NULL))
            AND p."moderationStatus" = 'VISIBLE'
            AND p."profileId" != ${profileId}
            AND p."profileId" NOT IN (SELECT "mutedId" FROM "mutes" WHERE "muterId" = ${profileId})
            AND p."profileId" NOT IN (SELECT "blockedId" FROM "blocks" WHERE "blockerId" = ${profileId})
            AND p."profileId" NOT IN (SELECT "blockerId" FROM "blocks" WHERE "blockedId" = ${profileId})
            AND p.id NOT IN (SELECT "postId" FROM "feed_hidden_posts" WHERE "profileId" = ${profileId})
            AND p."profileId" NOT IN (SELECT "authorId" FROM "feed_hidden_authors" WHERE "profileId" = ${profileId})
            AND NOT EXISTS (
              SELECT 1 FROM "feed_muted_keywords" fmk
              WHERE fmk."profileId" = ${profileId}
                AND p.caption IS NOT NULL
                AND POSITION(fmk.keyword IN LOWER(p.caption)) > 0
            )
            AND (${viewerSettings.allowMature} OR p."contentRating" = 'GENERAL')
            
          ORDER BY final_score DESC
          LIMIT ${limit}
          OFFSET ${skip}
        `;
      }

      if (postsRaw.length === 0) {
        return this.getTrendingFeed(page, limit, skip, profileId);
      }

      // Step C: Hydrate Post objects with full relations
      const postIds = postsRaw.map((p) => p.id);
      const hydratedPosts = await this.prisma.post.findMany({
        where: { id: { in: postIds } },
        include: this.postHydrationInclude(profileId),
      });

      // Sort back to algorithm order
      const sortedPosts = postIds
        .map((id) => hydratedPosts.find((p) => p.id === id))
        .filter(Boolean);

      // Fetch user's subscriptions and unlocked posts
      let subscribedCreatorIds = new Set<string>();
      let unlockedPostIds = new Set<string>();

      if (profileId) {
        const viewer = await this.prisma.profile.findUnique({
          where: { id: profileId },
          select: { userId: true },
        });
        const unlocks = viewer
          ? await this.prisma.postUnlock.findMany({
              where: { userId: viewer.userId },
              select: { postId: true },
            })
          : [];
        subscribedCreatorIds = new Set();
        unlockedPostIds = new Set(unlocks.map((u) => u.postId));
      }

      const formattedPosts = sortedPosts.map((post: any) => {
        const { likes, ...rest } = post;
        const isLiked = Array.isArray(likes) ? likes.length > 0 : false;

        // Attach algorithm reasoning score for debugging
        const rawData = postsRaw.find((r) => r.id === post.id);
        const recommendationMeta = this.buildRecommendationMeta(
          rawData,
          post.performanceScore || 0,
        );

        let finalPost = {
          ...rest,
          isLiked,
          ...recommendationMeta,
          shouldBlurSensitive:
            viewerSettings.blurSensitiveContent &&
            post.contentRating === 'MATURE',
        };

        if (finalPost.isPremium && finalPost.profileId !== profileId) {
          const isSubscribed = subscribedCreatorIds.has(finalPost.profileId);
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

      const feedWithPromotions = await this.injectPromotions(
        formattedPosts,
        profileId,
      );

      // hasMore-style total: avoid a fake fixed total for algorithmic feeds
      const total =
        feedWithPromotions.length < limit
          ? (page - 1) * limit + feedWithPromotions.length
          : page * limit + 1;
      const result = createPaginatedResult(
        feedWithPromotions,
        total,
        page,
        limit,
      );

      // Save to cache for 3 minutes (180000 ms)
      const ttl = process.env.NODE_ENV === 'production' ? 180000 : 1000;
      await this.cacheManager.set(cacheKey, result, ttl);

      return result;
    } catch (error) {
      console.error('Error generating Hybrid Feed:', error);
      return this.getTrendingFeed(page, limit, skip, profileId);
    }
  }

  /**
   * Chronological feed from Followed users.
   * Sensitive (`MATURE`) posts are not hidden here: Following is who the
   * viewer chose. Blur still applies. Discovery feeds filter separately.
   */
  async getFollowingFeed(profileId: string, pagination: PaginationDto) {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;
    const viewerSettings = await this.getViewerContentSettings(profileId);

    let posts: any[] = [];
    let total = 0;

    // 1. Try to read from Redis Inbox (Fast Path)
    const inboxPostIds = await this.feedInbox.getInbox(profileId, skip, limit);

    if (inboxPostIds.length > 0) {
      this.logger.debug(
        `Fetching ${inboxPostIds.length} posts from Redis inbox for user ${profileId}`,
      );

      const rawPosts = await this.prisma.post.findMany({
        where: {
          id: { in: inboxPostIds },
          moderationStatus: { in: ['VISIBLE', 'FLAGGED'] },
          scheduledStatus: 'PUBLISHED',
        },
        include: this.postHydrationInclude(profileId),
      });

      // Maintain Redis order (chronological by push time)
      posts = inboxPostIds
        .map((id) => rawPosts.find((p) => p.id === id))
        .filter(Boolean);

      total = await this.feedInbox.getInboxCount(profileId);
    } else {
      // 2. Fallback to Slow SQL JOIN (Legacy Path) - Only if inbox is empty
      this.logger.debug(
        `Redis inbox empty for ${profileId}, falling back to SQL...`,
      );

      const [following, mutes, prefs] = await Promise.all([
        this.prisma.follow.findMany({
          where: { followerId: profileId, status: 'ACCEPTED' },
          select: { followingId: true },
        }),
        this.prisma.mute.findMany({
          where: { muterId: profileId },
          select: { mutedId: true },
        }),
        this.feedPreferences.getFilterSets(profileId),
      ]);

      const mutedIds = new Set([
        ...mutes.map((m) => m.mutedId),
        ...prefs.hiddenAuthorIds,
      ]);
      const followingIds = following
        .map((f) => f.followingId)
        .filter((id) => !mutedIds.has(id));

      followingIds.push(profileId); // Include own posts

      const preferenceFilter =
        prefs.hiddenPostIds.length > 0
          ? { id: { notIn: prefs.hiddenPostIds } }
          : {};

      const [fallbackPosts, fallbackTotal] = await Promise.all([
        this.prisma.post.findMany({
          where: {
            profileId: { in: followingIds },
            type: 'POST',
            moderationStatus: { in: ['VISIBLE', 'FLAGGED'] },
            scheduledStatus: 'PUBLISHED',
            ...preferenceFilter,
            OR: [
              { visibility: Visibility.PUBLIC },
              { visibility: Visibility.FOLLOWERS },
              { profileId },
            ],
          },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: this.postHydrationInclude(profileId),
        }),
        this.prisma.post.count({
          where: {
            profileId: { in: followingIds },
            type: 'POST',
            moderationStatus: { in: ['VISIBLE', 'FLAGGED'] },
            scheduledStatus: 'PUBLISHED',
            ...preferenceFilter,
          },
        }),
      ]);

      posts =
        prefs.mutedKeywords.length > 0
          ? fallbackPosts.filter((p) => {
              const caption = (p.caption || '').toLowerCase();
              return !prefs.mutedKeywords.some((kw) => caption.includes(kw));
            })
          : fallbackPosts;
      total = fallbackTotal;

      // Optional: We could trigger a background job to rebuild their inbox here,
      // but for now, they'll just get new posts seamlessly as they are created.
    }

    // 3. Hydrate Subscriptions and Unlocks (Common Path)
    let subscribedCreatorIds = new Set<string>();
    let unlockedPostIds = new Set<string>();

    if (profileId) {
      const viewer = await this.prisma.profile.findUnique({
        where: { id: profileId },
        select: { userId: true },
      });
      const unlocks = viewer
        ? await this.prisma.postUnlock.findMany({
            where: { userId: viewer.userId },
            select: { postId: true },
          })
        : [];
      subscribedCreatorIds = new Set();
      unlockedPostIds = new Set(unlocks.map((u) => u.postId));
    }

    const formattedPosts = posts.map((post: any) => {
      const { likes, ...rest } = post;
      const isLiked = Array.isArray(likes) ? likes.length > 0 : false;
      const recommendationMeta = this.buildRecommendationMeta(
        null,
        post.performanceScore || 0,
        'following',
      );

      let finalPost = {
        ...rest,
        isLiked,
        ...recommendationMeta,
        shouldBlurSensitive:
          viewerSettings.blurSensitiveContent &&
          post.contentRating === 'MATURE',
      };

      if (finalPost.isPremium && finalPost.profileId !== profileId) {
        const isSubscribed = subscribedCreatorIds.has(finalPost.profileId);
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

    const feedWithPromotions = await this.injectPromotions(
      formattedPosts,
      profileId,
    );

    return createPaginatedResult(feedWithPromotions, total, page, limit);
  }

  /**
   * Fallback / Trending feed logic
   */
  private async getTrendingFeed(
    page: number,
    limit: number,
    skip: number,
    currentProfileId?: string | null,
  ) {
    const viewerSettings = await this.getViewerContentSettings(
      currentProfileId ?? null,
    );
    const cacheKey = `feed:trending:user_${currentProfileId || 'guest'}:page_${page}:limit_${limit}:mature_${viewerSettings.allowMature}`;
    const cachedFeed = await this.cacheManager.get(cacheKey);
    if (cachedFeed) {
      return cachedFeed;
    }

    let mutedIds: string[] = [];
    if (currentProfileId) {
      const mutes = await this.prisma.mute.findMany({
        where: { muterId: currentProfileId },
        select: { mutedId: true },
      });
      mutedIds = mutes.map((m) => m.mutedId);
    }

    const where = {
      visibility: Visibility.PUBLIC,
      moderationStatus: 'VISIBLE' as const,
      scheduledStatus: 'PUBLISHED' as const,
      ...(mutedIds.length > 0 ? { profileId: { notIn: mutedIds } } : {}),
      ...(viewerSettings.allowMature
        ? {}
        : { contentRating: 'GENERAL' as const }),
    };

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        orderBy: [{ performanceScore: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        include: this.postHydrationInclude(currentProfileId),
      }),
      this.prisma.post.count({ where }),
    ]);

    let subscribedCreatorIds = new Set<string>();
    let unlockedPostIds = new Set<string>();

    if (currentProfileId) {
      const viewer = await this.prisma.profile.findUnique({
        where: { id: currentProfileId },
        select: { userId: true },
      });
      const unlocks = viewer
        ? await this.prisma.postUnlock.findMany({
            where: { userId: viewer.userId },
            select: { postId: true },
          })
        : [];
      subscribedCreatorIds = new Set();
      unlockedPostIds = new Set(unlocks.map((u) => u.postId));
    }

    const formattedPosts = posts.map((post: any) => {
      const { likes, ...rest } = post;
      const isLiked =
        currentProfileId && Array.isArray(likes) ? likes.length > 0 : false;
      const recommendationMeta = this.buildRecommendationMeta(
        null,
        post.performanceScore || 0,
        'popular',
      );

      let finalPost = {
        ...rest,
        isLiked,
        ...recommendationMeta,
        shouldBlurSensitive:
          viewerSettings.blurSensitiveContent &&
          post.contentRating === 'MATURE',
      };

      if (finalPost.isPremium && finalPost.profileId !== currentProfileId) {
        const isSubscribed = subscribedCreatorIds.has(finalPost.profileId);
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

    const feedWithPromotions = await this.injectPromotions(
      formattedPosts,
      currentProfileId,
    );

    const result = createPaginatedResult(
      feedWithPromotions,
      total,
      page,
      limit,
    );

    // Save to cache for 5 minutes (300000 ms)
    const ttl = process.env.NODE_ENV === 'production' ? 300000 : 1000;
    await this.cacheManager.set(cacheKey, result, ttl);

    return result;
  }

  /**
   * Helper to inject active promotions into a feed
   */
  private async injectPromotions(posts: any[], profileId?: string | null) {
    if (posts.length === 0) return posts;

    // We want to inject 1 promotion every 5 posts.
    const neededPromotions = Math.floor(posts.length / 5);
    if (neededPromotions === 0) return posts;

    let viewerLocation: string | undefined;
    let viewerUserId: string | undefined;
    if (profileId) {
      const viewer = await this.prisma.profile.findUnique({
        where: { id: profileId },
        include: { user: true },
      });
      viewerLocation = viewer?.location?.toLowerCase();
      viewerUserId = viewer?.userId;
    }

    const activePromotionsRaw = await this.prisma.promotion.findMany({
      where: {
        status: 'ACTIVE',
        targetType: 'POST',
        budgetCents: { gt: 0 },
        endDate: { gt: new Date() },
        ...(viewerUserId ? { userId: { not: viewerUserId } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    const activePromotions = activePromotionsRaw
      .filter((promo) => {
        if (!promo.countries) return true; // No country targeting
        const targetCountries = promo.countries
          .toLowerCase()
          .split(',')
          .map((c: string) => c.trim())
          .filter(Boolean);
        if (targetCountries.length === 0) return true;
        if (!viewerLocation) return false; // Viewer has no location, but promo requires one

        // Check if viewer's location matches any of the target countries
        return targetCountries.some((country: string) =>
          viewerLocation!.includes(country),
        );
      })
      .slice(0, neededPromotions);

    if (activePromotions.length === 0) return posts;

    const promotedPostIds = activePromotions.map((p) => p.targetId);
    const promotedPostsRaw = await this.prisma.post.findMany({
      where: { id: { in: promotedPostIds } },
      include: this.postHydrationInclude(profileId),
    });

    const promotedPostsDict = new Map();
    for (const p of promotedPostsRaw) {
      const { likes, ...rest } = p;
      const isLiked =
        profileId && Array.isArray(likes) ? likes.length > 0 : false;
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
