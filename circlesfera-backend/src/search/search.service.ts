import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Hashtag, Post } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { AIService } from '../ai/ai.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface SearchResponse {
  users: any[];
  hashtags: Hashtag[];
  semanticPosts: any[];
}

/**
 * Service for user search, hashtag search, AI-powered semantic search, and search history.
 * Uses cache-manager for embedding caching and AIService for vector similarity.
 */
@Injectable()
export class SearchService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @Inject(AIService) private readonly aiService: AIService,
  ) {}

  /**
   * AI-powered semantic search for posts.
   * Uses vector similarity to find content that matches the concept of the query,
   * even if exact keywords aren't present.
   */
  async semanticSearchPosts(query: string, limit = 10): Promise<any[]> {
    if (!query || query.length < 3) return [];

    const cacheKey = `search:semantic:${query.toLowerCase().replace(/\s/g, '_')}:${limit}`;
    const cached = await this.cacheManager.get<any[]>(cacheKey);
    if (cached) return cached;

    try {
      // 1. Generate embedding for the search query
      const queryEmbedding = await this.aiService.generateEmbedding(query);

      // 2. Find similar posts using pgvector (Cosine distance)
      const matches: any[] = await this.prisma.$queryRaw`
        SELECT p.id,
               (p.embedding <=> ${queryEmbedding}::vector) as distance
        FROM "Post" p
        WHERE p.visibility = 'PUBLIC'
          AND p."moderationStatus" = 'VISIBLE'
          AND p.embedding IS NOT NULL
        ORDER BY distance ASC
        LIMIT ${limit}
      `;

      // Guard against undefined matches
      if (!matches || matches.length === 0) return [];


      if (matches.length === 0) return [];

      // 3. Enrich the posts with details
      const posts = await Promise.all(
        matches.map(async (m) => {
          const post = await this.prisma.post.findUnique({
            where: { id: m.id },
            include: {
              user: { include: { profile: true } },
              media: true,
              _count: { select: { likes: true, comments: true } },
            },
          });
          return { ...post, similarityScore: 1 - m.distance };
        }),
      );

      await this.cacheManager.set(cacheKey, posts, 600000); // 10 min cache for semantic
      return posts;
    } catch (error) {
      console.error('Semantic Search Error:', error);
      return [];
    }
  }

  /**
   * Perform a combined search for users and hashtags. Saves search history if authenticated.
   * @param query - The search query (min 2 chars)
   * @param userId - Optional authenticated user ID for history tracking
   */
  async search(query: string, userId?: string): Promise<SearchResponse> {
    if (!query || query.length < 2) {
      return { users: [], hashtags: [], semanticPosts: [] };
    }

    const sanitizedQuery = query.toLowerCase();
    const cacheKey = `search:combined:${sanitizedQuery.replace(/\s/g, '_')}:${userId || 'guest'}`;
    const cached = await this.cacheManager.get<SearchResponse>(cacheKey);
    if (cached) return cached;

    // Save search history if userId is provided
    if (userId) {
      this.prisma.searchHistory
        .create({
          data: {
            userId,
            query: sanitizedQuery,
          },
        })
        .catch((err: unknown) => {
          console.error('Failed to save search history', err);
        });
    }

    const [users, hashtags, semanticPosts] = await Promise.all([
      this.searchUsers(sanitizedQuery, userId),
      this.prisma.hashtag.findMany({
        where: {
          tag: {
            contains: sanitizedQuery,
            mode: 'insensitive',
          },
        },
        take: 5,
        orderBy: {
          postCount: 'desc',
        },
      }),
      this.semanticSearchPosts(sanitizedQuery, 3), // Get top 3 semantic matches for combined view
    ]);

    const result: SearchResponse = {
      users: users.slice(0, 5),
      hashtags,
      semanticPosts,
    };

    await this.cacheManager.set(cacheKey, result, 300000); // 5 min cache
    return result;
  }

  /**
   * Get the user's 10 most recent unique search queries.
   * @param userId - The authenticated user's ID
   */
  async getHistory(userId: string) {
    return this.prisma.searchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      distinct: ['query'],
    });
  }

  /**
   * Clear all search history for a user.
   * @param userId - The authenticated user's ID
   */
  async clearHistory(userId: string) {
    return this.prisma.searchHistory.deleteMany({
      where: { userId },
    });
  }

  /**
   * Search for users with Social Discovery ranking.
   * Priority: Mutual Connections (People you follow who follow them) > Verification Level > Followers Count.
   * @param query - The search query
   * @param viewerId - Optional ID of the user performing the search
   */
  async searchUsers(query: string, viewerId?: string): Promise<any[]> {
    if (!query || query.length < 2) return [];

    const sanitizedQuery = query.toLowerCase();

    // 1. Get potential matches (extended pool for ranking)
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          {
            profile: {
              username: { contains: sanitizedQuery, mode: 'insensitive' },
            },
          },
          {
            profile: {
              fullName: { contains: sanitizedQuery, mode: 'insensitive' },
            },
          },
        ],
      },
      take: 30, // Larger pool for better ranking
      include: {
        profile: {
          select: {
            username: true,
            fullName: true,
            avatar: true,
            thumbnailUrl: true,
            standardUrl: true,
          },
        },
        _count: {
          select: { followers: true },
        },
      },
    });

    if (users.length === 0) return [];

    // 2. Personalize ranking if viewerId is provided
    const rankedUsers = await Promise.all(
      users.map(async (user) => {
        let mutualCount = 0;
        let followedByFriendNames: string[] = [];

        if (viewerId && viewerId !== user.id) {
          // Social Discovery: Find people followed by viewer who follow this target
          const mutualFollows = await this.prisma.follow.findMany({
            where: {
              followingId: user.id,
              follower: {
                followers: {
                  some: { followerId: viewerId },
                },
              },
            },
            take: 3,
            select: {
              follower: {
                select: { profile: { select: { username: true } } },
              },
            },
          });

          mutualCount = mutualFollows.length;
          followedByFriendNames = mutualFollows
            .map((f) => f.follower.profile?.username)
            .filter(Boolean) as string[];
        }

        /**
         * Ponderación de Autoridad & Algoritmo de Relevancia
         * - Base: log10 de seguidores (meritocracia histórica)
         * - Multiplicador Social: +5 por cada amigo mutuo (descubrimiento orgánico)
         * - Coeficiente de Autoridad: +20 si es Verificado (confianza oficial)
         */
        const authoritySignal = user.verificationLevel !== 'BASIC' ? 20 : 0;
        const score =
          Math.log10(user._count.followers + 1) +
          mutualCount * 5 +
          authoritySignal;

        return {
          ...user.profile,
          id: user.id,
          verificationLevel: user.verificationLevel,
          mutualCount,
          followedByFriends: followedByFriendNames,
          score,
        };
      }),
    );

    return rankedUsers.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  /**
   * Get trending posts based on interaction Velocity (decays over time).
   * Formula: (Likes_1h * 2 + Comments_1h * 5) / (Hours_Since_Post + 2)^1.8
   * @param limit - Number of posts to return
   */
  async getTrending(limit = 10): Promise<Post[]> {
    const cacheKey = `trending_v2:${limit}`;
    const cached = await this.cacheManager.get<Post[]>(cacheKey);
    if (cached) return cached;

    // Use complex SQL for real-time velocity calculation with gravity decay
    const trending = await this.prisma.$queryRaw<any[]>`
      SELECT 
        p.id,
        (
          (
            (SELECT COUNT(*) FROM likes l WHERE l."postId" = p.id AND l."createdAt" > NOW() - INTERVAL '1 hour') * 2.5 +
            (SELECT COUNT(*) FROM "Comment" c WHERE c."postId" = p.id AND c."createdAt" > NOW() - INTERVAL '1 hour') * 5.0
          ) / POW(EXTRACT(EPOCH FROM (NOW() - p."createdAt")) / 3600 + 2, 1.8)
        ) as velocity_score
      FROM posts p
      WHERE p."createdAt" > NOW() - INTERVAL '48 hours'
        AND p.visibility = 'PUBLIC'
      ORDER BY velocity_score DESC
      LIMIT ${limit};
    `;

    const postIds = trending.map((t) => t.id);
    if (postIds.length === 0) return [];

    const posts = await this.prisma.post.findMany({
      where: { id: { in: postIds } },
      include: {
        user: { include: { profile: true } },
        media: true,
        _count: { select: { likes: true, comments: true } },
      },
    });

    const sortedPosts = posts.sort(
      (a, b) => postIds.indexOf(a.id) - postIds.indexOf(b.id),
    );

    await this.cacheManager.set(cacheKey, sortedPosts, 60000); // 1 min cache for hot trending
    return sortedPosts;
  }

  /**
   * Search posts with Authority Weighting and Velocity ranking.
   * @param query - Keyword to search in captions
   */
  async searchPosts(query: string): Promise<Post[]> {
    if (!query || query.length < 2) return [];

    const sanitizedQuery = query.toLowerCase();

    const posts = await this.prisma.post.findMany({
      where: {
        caption: { contains: sanitizedQuery, mode: 'insensitive' },
        visibility: 'PUBLIC',
      },
      include: {
        user: { include: { profile: true } },
        media: true,
        _count: { select: { likes: true, comments: true } },
      },
      take: 50,
    });

    // Rank by Authority Signal + Simple engagement
    return posts
      .sort((a, b) => {
        const authorityA = a.user.verificationLevel !== 'BASIC' ? 100 : 0;
        const authorityB = b.user.verificationLevel !== 'BASIC' ? 100 : 0;

        const scoreA =
          a._count.likes * 1.2 + a._count.comments * 2.5 + authorityA;
        const scoreB =
          b._count.likes * 1.2 + b._count.comments * 2.5 + authorityB;

        return scoreB - scoreA;
      })
      .slice(0, 15);
  }
}
