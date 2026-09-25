import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Hashtag, Post } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { AIService } from '../ai/ai.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  USER_HARD_DELETED_EVENT,
  type UserHardDeletedEvent,
} from '../users/events/user-hard-deleted.event.js';

export interface SearchResponse {
  users: any[];
  hashtags: Hashtag[];
  semanticPosts: any[];
  semanticProfiles: any[];
}

// Service for user search, hashtag search, AI-powered semantic search, and search history.
// Uses cache-manager for embedding caching and AIService for vector similarity.
@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @Inject(AIService) private readonly aiService: AIService,
  ) {}

  // AI-powered semantic search for posts.
  // Uses vector similarity to find content that matches the concept of the query,
  // Even if exact keywords aren't present.
  async semanticSearchPosts(
    query: string,
    limit = 10,
    profileId?: string,
  ): Promise<any[]> {
    if (!query || query.length < 3) return [];

    const cacheKey = `search:semantic:${query.toLowerCase().replace(/\s/g, '_')}:${limit}:${profileId || 'guest'}`;
    const cached = await this.cacheManager.get<any[]>(cacheKey);
    if (cached) return cached;

    try {
      // 1. Generate embedding for the search query
      const queryEmbedding = await this.aiService.generateEmbedding(query);
      const vectorLiteral = JSON.stringify(queryEmbedding);

      // 2. Find similar posts via post_embeddings (pgvector cosine distance)
      let matches: any[];

      if (profileId) {
        matches = await this.prisma.$queryRaw`
          SELECT p.id,
                 (pe.vector <=> ${vectorLiteral}::vector) as distance
          FROM "post_embeddings" pe
          JOIN "posts" p ON p.id = pe."postId"
          WHERE p.visibility = 'PUBLIC'
            AND p."moderationStatus" = 'VISIBLE'
            AND p."profileId" NOT IN (SELECT "blockedId" FROM "blocks" WHERE "blockerId" = ${profileId})
            AND p."profileId" NOT IN (SELECT "blockerId" FROM "blocks" WHERE "blockedId" = ${profileId})
          ORDER BY distance ASC
          LIMIT ${limit}
        `;
      } else {
        matches = await this.prisma.$queryRaw`
          SELECT p.id,
                 (pe.vector <=> ${vectorLiteral}::vector) as distance
          FROM "post_embeddings" pe
          JOIN "posts" p ON p.id = pe."postId"
          WHERE p.visibility = 'PUBLIC'
            AND p."moderationStatus" = 'VISIBLE'
          ORDER BY distance ASC
          LIMIT ${limit}
        `;
      }

      if (!matches || matches.length === 0) return [];

      // 3. Enrich the posts with details
      const posts = await Promise.all(
        matches.map(async (m) => {
          const post = await this.prisma.post.findUnique({
            where: { id: m.id },
            include: {
              profile: { include: { user: true } },
              media: true,
              poll: { select: { id: true } },
              qnaBox: { select: { id: true } },
              _count: { select: { likes: true, comments: true } },
            },
          });
          return { ...post, similarityScore: 1 - m.distance };
        }),
      );

      const filtered = posts.filter(Boolean);
      await this.cacheManager.set(cacheKey, filtered, 600000); // 10 min cache for semantic
      return filtered;
    } catch (error) {
      console.error('Semantic Search Error:', error);
      return [];
    }
  }

  // AI-powered semantic search for profiles using pgvector distance.
  async semanticSearchProfiles(
    query: string,
    limit = 10,
    profileId?: string,
  ): Promise<any[]> {
    if (!query || query.length < 3) return [];

    const cacheKey = `search:semantic_profiles:${query.toLowerCase().replace(/\s/g, '_')}:${limit}:${profileId || 'guest'}`;
    const cached = await this.cacheManager.get<any[]>(cacheKey);
    if (cached) return cached;

    try {
      const queryEmbedding = await this.aiService.generateEmbedding(query);
      const vectorLiteral = JSON.stringify(queryEmbedding);
      let matches: any[];

      if (profileId) {
        matches = await this.prisma.$queryRaw`
          SELECT pe."profileId",
                 (pe.vector <=> ${vectorLiteral}::vector) as distance
          FROM "profile_embeddings" pe
          JOIN "profiles" pr ON pr.id = pe."profileId"
          WHERE pr."profileId" NOT IN (SELECT "blockedId" FROM "blocks" WHERE "blockerId" = ${profileId})
            AND pr."profileId" NOT IN (SELECT "blockerId" FROM "blocks" WHERE "blockedId" = ${profileId})
          ORDER BY distance ASC
          LIMIT ${limit}
        `;
      } else {
        matches = await this.prisma.$queryRaw`
          SELECT pe."profileId",
                 (pe.vector <=> ${vectorLiteral}::vector) as distance
          FROM "profile_embeddings" pe
          ORDER BY distance ASC
          LIMIT ${limit}
        `;
      }

      if (!matches || matches.length === 0) return [];

      const profiles = await Promise.all(
        matches.map(async (m) => {
          const profile = await this.prisma.profile.findUnique({
            where: { id: m.profileId },
            include: {
              user: {
                select: {
                  id: true,
                  role: true,
                },
              },
            },
          });
          return { ...profile, similarityScore: 1 - m.distance };
        }),
      );

      const filtered = profiles.filter(Boolean);
      await this.cacheManager.set(cacheKey, filtered, 600000);
      return filtered;
    } catch (error) {
      console.error('Semantic Profile Search Error:', error);
      return [];
    }
  }

  // Perform a combined search for users and hashtags. Saves search history if authenticated.
  // Param query: The search query (min 2 chars)
  // Param profileId: Optional authenticated user ID for history tracking
  async search(query: string, profileId?: string): Promise<SearchResponse> {
    if (!query || query.length < 2) {
      return {
        users: [],
        hashtags: [],
        semanticPosts: [],
        semanticProfiles: [],
      };
    }

    const sanitizedQuery = query.toLowerCase();
    const cacheKey = `search:combined:v2:${sanitizedQuery.replace(/\s/g, '_')}:${profileId || 'guest'}`;
    const cached = await this.cacheManager.get<SearchResponse>(cacheKey);
    if (cached) return cached;

    // Save search history if profileId is provided.
    // expiresAt is set explicitly (DATA-005): MaintenanceService.cleanupOldSearchHistory
    // is the canonical purge job and relies on this 90-day GDPR retention window.
    if (profileId) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90);
      this.prisma.searchHistory
        .create({
          data: {
            profileId,
            query: sanitizedQuery,
            expiresAt,
          },
        })
        .catch((err: unknown) => {
          console.error('Failed to save search history', err);
        });
    }

    const [users, hashtags, semanticPosts, semanticProfiles] =
      await Promise.all([
        this.searchUsers(sanitizedQuery, profileId),
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
        this.semanticSearchPosts(sanitizedQuery, 3, profileId),
        query.length >= 3
          ? this.semanticSearchProfiles(sanitizedQuery, 5, profileId)
          : Promise.resolve([]),
      ]);

    const keywordProfileIds = new Set(users.map((u: { id: string }) => u.id));
    const uniqueSemanticProfiles = (semanticProfiles || []).filter(
      (p: { user?: { id?: string }; profileId?: string }) => {
        const id = p.user?.id || p.profileId;
        return id && !keywordProfileIds.has(id);
      },
    );

    const result: SearchResponse = {
      users: users.slice(0, 5),
      hashtags,
      semanticPosts,
      semanticProfiles: uniqueSemanticProfiles,
    };

    await this.cacheManager.set(cacheKey, result, 300000); // 5 min cache
    return result;
  }

  // Get the user's 10 most recent unique search queries.
  // Param profileId: The authenticated user's ID
  async getHistory(profileId: string) {
    return this.prisma.searchHistory.findMany({
      where: { profileId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      distinct: ['query'],
    });
  }

  // Clear all search history for a user.
  // Param profileId: The authenticated user's ID
  async clearHistory(profileId: string) {
    return this.prisma.searchHistory.deleteMany({
      where: { profileId },
    });
  }

  // Purges search derived state (history) on account hard deletion.
  @OnEvent(USER_HARD_DELETED_EVENT)
  async handleUserHardDeleted(event: UserHardDeletedEvent): Promise<void> {
    if (!event.profileIds || event.profileIds.length === 0) return;
    for (const profileId of event.profileIds) {
      await this.clearHistory(profileId);
    }
    this.logger.log(
      `Purged search history for hard-deleted user ${event.userId} (profiles: ${event.profileIds.join(', ')})`,
    );
  }

  // Search for users with Social Discovery ranking.
  // Priority: Mutual Connections (People you follow who follow them) > Verification Level > Followers Count.
  // Param query: The search query
  // Param viewerId: Optional ID of the user performing the search

  async searchUsers(query: string, viewerId?: string): Promise<any[]> {
    if (!query || query.length < 2) return [];

    const sanitizedQuery = query.toLowerCase();

    // 1. Get potential matches (extended pool for ranking)
    const profiles = await this.prisma.profile.findMany({
      where: {
        OR: [
          { username: { contains: sanitizedQuery, mode: 'insensitive' } },
          { fullName: { contains: sanitizedQuery, mode: 'insensitive' } },
        ],
      },
      take: 30, // Larger pool for better ranking
      include: {
        _count: {
          select: { followers: true },
        },
      },
    });

    if (profiles.length === 0) return [];

    // 2. Personalize ranking if viewerId is provided.
    // Social Discovery: for each candidate, find up to 3 people the viewer
    // follows who also follow that candidate. Batched into a single query
    // across all candidates (DATA-002) instead of one findMany per profile —
    // grouped by followingId below, same "up to 3, arbitrary order" shape as
    // the original per-profile take: 3.
    const mutualsByCandidate = new Map<string, string[]>();
    if (viewerId) {
      const candidateIds = profiles
        .filter((profile) => profile.id !== viewerId)
        .map((profile) => profile.id);

      if (candidateIds.length > 0) {
        const mutualFollows = await this.prisma.follow.findMany({
          where: {
            followingId: { in: candidateIds },
            follower: {
              followers: {
                some: { followerId: viewerId },
              },
            },
          },
          take: 500, // Safety bound; realistic totals are far smaller.
          select: {
            followingId: true,
            follower: { select: { username: true } },
          },
        });

        for (const follow of mutualFollows) {
          const names = mutualsByCandidate.get(follow.followingId) ?? [];
          if (names.length < 3 && follow.follower.username) {
            names.push(follow.follower.username);
          }
          mutualsByCandidate.set(follow.followingId, names);
        }
      }
    }

    const rankedUsers = profiles.map((profile) => {
      const followedByFriendNames = mutualsByCandidate.get(profile.id) ?? [];
      const mutualCount = followedByFriendNames.length;

      const authoritySignal = profile.verificationLevel !== 'BASIC' ? 20 : 0;
      const score =
        Math.log10(profile._count.followers + 1) +
        mutualCount * 5 +
        authoritySignal;

      return {
        ...profile,
        verificationLevel: profile.verificationLevel,
        mutualCount,
        followedByFriends: followedByFriendNames,
        score,
      };
    });

    return rankedUsers.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  // Get trending posts based on interaction Velocity (decays over time).
  // Formula: (Likes_1h * 2 + Comments_1h * 5) / (Hours_Since_Post + 2)^1.8
  // Param limit: Number of posts to return
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
        profile: { include: { user: true } },
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

  // Search posts with Authority Weighting and Velocity ranking.
  // Param query: Keyword to search in captions
  async searchPosts(query: string): Promise<Post[]> {
    if (!query || query.length < 2) return [];

    const sanitizedQuery = query.toLowerCase();

    const posts = await this.prisma.post.findMany({
      where: {
        caption: { contains: sanitizedQuery, mode: 'insensitive' },
        visibility: 'PUBLIC',
      },
      include: {
        profile: { include: { user: true } },
        media: true,
        _count: { select: { likes: true, comments: true } },
      },
      take: 50,
    });

    // Rank by Authority Signal + Simple engagement
    return posts
      .sort((a, b) => {
        const authorityA = a.profile.verificationLevel !== 'BASIC' ? 100 : 0;
        const authorityB = b.profile.verificationLevel !== 'BASIC' ? 100 : 0;

        const scoreA =
          a._count.likes * 1.2 + a._count.comments * 2.5 + authorityA;
        const scoreB =
          b._count.likes * 1.2 + b._count.comments * 2.5 + authorityB;

        return scoreB - scoreA;
      })
      .slice(0, 15);
  }
}
