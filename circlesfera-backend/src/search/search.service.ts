import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Hashtag, Post } from '@prisma/client';
import type { Cache } from 'cache-manager';
import { AIService } from '../ai/ai.service.js';
import {
  loadViewerContent,
  shouldBlur,
} from '../common/content/viewer-content.js';
import {
  getBlockedProfileIds,
  visibleToViewerWhere,
} from '../common/policies/block.policy.js';
import {
  LISTED_POST,
  SHOWN_COMMENTS_COUNT,
} from '../common/policies/removed-content.policy.js';
import {
  filterToViewerAudience,
  isTestViewerProfile,
} from '../common/policies/test-account.policy.js';
import { PUBLIC_PROFILE_SELECT } from '../common/selects/public-profile.select.js';
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
  // Posts as this viewer asked to see sensitive content: mature ones only if
  // allowed (their own always), each marked when it shows blurred.
  private async forViewer<
    T extends { contentRating?: string | null; profileId?: string },
  >(
    posts: T[],
    viewerId?: string,
  ): Promise<Array<T & { shouldBlurSensitive: boolean }>> {
    const content = await loadViewerContent(this.prisma, viewerId);
    return posts
      .filter(
        (p) =>
          content.allowMature ||
          p.contentRating !== 'MATURE' ||
          (viewerId && p.profileId === viewerId),
      )
      .map((p) => ({
        ...p,
        shouldBlurSensitive: shouldBlur(p, content, viewerId),
      }));
  }

  async semanticSearchPosts(
    query: string,
    limit = 10,
    profileId?: string,
  ): Promise<any[]> {
    if (!query || query.length < 3) return [];

    const cacheKey = `search:semantic:v2:${query.toLowerCase().replace(/\s/g, '_')}:${limit}:${profileId || 'guest'}`;
    const cached = await this.cacheManager.get<any[]>(cacheKey);
    if (cached) return this.forViewer(cached, profileId);

    try {
      // 1. Generate embedding for the search query
      const queryEmbedding = await this.aiService.generateEmbedding(query);
      const vectorLiteral = JSON.stringify(queryEmbedding);
      // Only the viewer's audience; anonymous callers see real accounts.
      const viewerIsTest = await isTestViewerProfile(this.prisma, profileId);

      // 2. Find similar posts via post_embeddings (pgvector cosine distance)
      let matches: any[];

      if (profileId) {
        matches = await this.prisma.$queryRaw`
          SELECT p.id,
                 (pe.vector <=> ${vectorLiteral}::vector) as distance
          FROM "post_embeddings" pe
          JOIN "posts" p ON p.id = pe."postId"
          JOIN "profiles" pr ON pr.id = p."profileId"
          JOIN "users" u ON u.id = pr."userId"
          WHERE p.visibility = 'PUBLIC'
            AND p."moderationStatus" = 'VISIBLE'
            AND p."deletedAt" IS NULL
            AND p."archivedAt" IS NULL
            AND pr."privacyLevel" = 'PUBLIC'
            AND u."deactivatedAt" IS NULL
            AND u."isActive" = true
            AND pr."isAccountBanned" = false
            AND (pr."suspendedUntil" IS NULL OR pr."suspendedUntil" < NOW())
            AND u."isTestAccount" = ${viewerIsTest}
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
          JOIN "profiles" pr ON pr.id = p."profileId"
          JOIN "users" u ON u.id = pr."userId"
          WHERE p.visibility = 'PUBLIC'
            AND p."moderationStatus" = 'VISIBLE'
            AND p."deletedAt" IS NULL
            AND p."archivedAt" IS NULL
            AND pr."privacyLevel" = 'PUBLIC'
            AND u."deactivatedAt" IS NULL
            AND u."isActive" = true
            AND pr."isAccountBanned" = false
            AND (pr."suspendedUntil" IS NULL OR pr."suspendedUntil" < NOW())
            AND u."isTestAccount" = ${viewerIsTest}
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
              profile: { select: PUBLIC_PROFILE_SELECT },
              media: true,
              poll: { select: { id: true } },
              qnaBox: { select: { id: true } },
              _count: {
                select: { likes: true, comments: SHOWN_COMMENTS_COUNT },
              },
            },
          });
          return { ...post, similarityScore: 1 - m.distance };
        }),
      );

      const filtered = posts.filter(Boolean);
      await this.cacheManager.set(cacheKey, filtered, 600000); // 10 min cache for semantic
      return this.forViewer(filtered, profileId);
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

    const cacheKey = `search:semantic_profiles:v2:${query.toLowerCase().replace(/\s/g, '_')}:${limit}:${profileId || 'guest'}`;
    const cached = await this.cacheManager.get<any[]>(cacheKey);
    if (cached) return cached;

    try {
      const queryEmbedding = await this.aiService.generateEmbedding(query);
      const vectorLiteral = JSON.stringify(queryEmbedding);
      // Only the viewer's audience; anonymous callers see real accounts.
      const viewerIsTest = await isTestViewerProfile(this.prisma, profileId);
      let matches: any[];

      if (profileId) {
        matches = await this.prisma.$queryRaw`
          SELECT pe."profileId",
                 (pe.vector <=> ${vectorLiteral}::vector) as distance
          FROM "profile_embeddings" pe
          JOIN "profiles" pr ON pr.id = pe."profileId"
          JOIN "users" u ON u.id = pr."userId"
          WHERE pr."privacyLevel" = 'PUBLIC'
            AND u."deactivatedAt" IS NULL
            AND u."isActive" = true
            AND pr."isAccountBanned" = false
            AND (pr."suspendedUntil" IS NULL OR pr."suspendedUntil" < NOW())
            AND u."isTestAccount" = ${viewerIsTest}
            AND pr.id NOT IN (SELECT "blockedId" FROM "blocks" WHERE "blockerId" = ${profileId})
            AND pr.id NOT IN (SELECT "blockerId" FROM "blocks" WHERE "blockedId" = ${profileId})
          ORDER BY distance ASC
          LIMIT ${limit}
        `;
      } else {
        matches = await this.prisma.$queryRaw`
          SELECT pe."profileId",
                 (pe.vector <=> ${vectorLiteral}::vector) as distance
          FROM "profile_embeddings" pe
          JOIN "profiles" pr ON pr.id = pe."profileId"
          JOIN "users" u ON u.id = pr."userId"
          WHERE pr."privacyLevel" = 'PUBLIC'
            AND u."deactivatedAt" IS NULL
            AND u."isActive" = true
            AND pr."isAccountBanned" = false
            AND (pr."suspendedUntil" IS NULL OR pr."suspendedUntil" < NOW())
            AND u."isTestAccount" = ${viewerIsTest}
          ORDER BY distance ASC
          LIMIT ${limit}
        `;
      }

      if (!matches || matches.length === 0) return [];

      const profiles = await Promise.all(
        matches.map(async (m) => {
          const profile = await this.prisma.profile.findUnique({
            where: { id: m.profileId },
            select: PUBLIC_PROFILE_SELECT,
          });
          return profile
            ? { ...profile, similarityScore: 1 - m.distance }
            : null;
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
  // Param verifiedOnly: people results limited to Profiles with a plan badge
  async search(
    query: string,
    profileId?: string,
    verifiedOnly = false,
  ): Promise<SearchResponse> {
    if (!query || query.length < 2) {
      return {
        users: [],
        hashtags: [],
        semanticPosts: [],
        semanticProfiles: [],
      };
    }

    const sanitizedQuery = query.toLowerCase();
    const cacheKey = `search:combined:v4:${sanitizedQuery.replace(/\s/g, '_')}:${profileId || 'guest'}:${verifiedOnly ? 'verified' : 'all'}`;
    const cached = await this.cacheManager.get<SearchResponse>(cacheKey);
    if (cached) return cached;

    // Save search history if profileId is provided.
    // expiresAt is set explicitly: MaintenanceService.cleanupOldSearchHistory
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
        this.searchUsers(sanitizedQuery, profileId, verifiedOnly),
        this.prisma.hashtag.findMany({
          where: {
            tag: {
              contains: sanitizedQuery,
              mode: 'insensitive',
            },
            // One hidden by staff is not offered.
            isHidden: false,
            // Only tags used by Profiles the viewer can see (blocks), on
            // posts moderation has not removed.
            posts: {
              some: {
                post: {
                  ...LISTED_POST,
                  profile: await visibleToViewerWhere(this.prisma, profileId),
                },
              },
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
      (p: { id?: string; verificationLevel?: string }) => {
        const id = p.id;
        if (!id || keywordProfileIds.has(id)) return false;
        // The people found by meaning obey the same filter as the ones
        // found by name: with it on, only Profiles with a plan badge.
        return (
          !verifiedOnly ||
          (p.verificationLevel !== undefined && p.verificationLevel !== 'BASIC')
        );
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
  // Priority: Mutual Connections (People you follow who follow them) > Followers Count.
  // A plan does not move a Profile up. The person searching can ask for
  // verified Profiles only, which is a filter and not an order.
  // Param query: The search query
  // Param viewerId: Optional ID of the user performing the search

  // Param verifiedOnly: only Profiles with a plan badge
  async searchUsers(
    query: string,
    viewerId?: string,
    verifiedOnly = false,
  ): Promise<any[]> {
    if (!query || query.length < 2) return [];

    const sanitizedQuery = query.toLowerCase();

    // 1. Get potential matches (extended pool for ranking)
    const profiles = await this.prisma.profile.findMany({
      where: {
        OR: [
          { username: { contains: sanitizedQuery, mode: 'insensitive' } },
          { fullName: { contains: sanitizedQuery, mode: 'insensitive' } },
        ],
        // Banned or suspended Profiles, and accounts that are closed or
        // deactivated, are not findable. A private Profile is: its name and
        // photo show, its content does not.
        user: {
          deactivatedAt: null,
          isActive: true,
        },
        isAccountBanned: false,
        ...(verifiedOnly ? { verificationLevel: { not: 'BASIC' } } : {}),
        // Blocked Profiles and other audiences are not findable.
        AND: [
          await visibleToViewerWhere(this.prisma, viewerId),
          {
            OR: [
              { suspendedUntil: null },
              { suspendedUntil: { lt: new Date() } },
            ],
          },
        ],
      },
      take: 30, // Larger pool for better ranking
      select: {
        ...PUBLIC_PROFILE_SELECT,
        _count: {
          select: { followers: true },
        },
      },
    });

    if (profiles.length === 0) return [];

    // 2. Personalize ranking if viewerId is provided.
    // Social Discovery: for each candidate, find up to 3 people the viewer
    // follows who also follow that candidate. Batched into a single query
    // across all candidates instead of one findMany per profile —
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

      const score = Math.log10(profile._count.followers + 1) + mutualCount * 5;

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
  async getTrending(limit = 10, viewerId?: string): Promise<Post[]> {
    // The cached list is viewer-independent; blocks and audiences
    // are applied per viewer afterwards so neither leaks through the cache.
    const blocked = new Set(await getBlockedProfileIds(this.prisma, viewerId));
    const withoutBlocked = async (posts: Post[]) =>
      this.forViewer(
        await filterToViewerAudience(
          this.prisma,
          viewerId,
          posts.filter((p) => !blocked.has(p.profileId)),
          (p) => p.profileId,
        ),
        viewerId,
      );

    const cacheKey = `trending_v4:${limit}`;
    const cached = await this.cacheManager.get<Post[]>(cacheKey);
    if (cached) return withoutBlocked(cached);

    // Use complex SQL for real-time velocity calculation with gravity decay
    const trending = await this.prisma.$queryRaw<any[]>`
      SELECT 
        p.id,
        (
          (
            (SELECT COUNT(*) FROM likes l WHERE l."postId" = p.id AND l."createdAt" > NOW() - INTERVAL '1 hour') * 2.5 +
            (SELECT COUNT(*) FROM comments c WHERE c."postId" = p.id AND c."createdAt" > NOW() - INTERVAL '1 hour') * 5.0
          ) / POW(EXTRACT(EPOCH FROM (NOW() - p."createdAt")) / 3600 + 2, 1.8)
        ) as velocity_score
      FROM posts p
      JOIN profiles pr ON pr.id = p."profileId"
      JOIN users u ON u.id = pr."userId"
      WHERE p."createdAt" > NOW() - INTERVAL '48 hours'
        AND p.visibility = 'PUBLIC'
        AND p."moderationStatus" = 'VISIBLE'
        AND p."deletedAt" IS NULL
        AND p."archivedAt" IS NULL
        AND pr."privacyLevel" = 'PUBLIC'
        AND u."deactivatedAt" IS NULL
      ORDER BY velocity_score DESC
      LIMIT ${limit};
    `;

    const postIds = trending.map((t) => t.id);
    if (postIds.length === 0) return [];

    // A post deleted, archived or removed since it was ranked is left out.
    const posts = await this.prisma.post.findMany({
      where: { id: { in: postIds }, ...LISTED_POST },
      include: {
        profile: { select: PUBLIC_PROFILE_SELECT },
        media: true,
        _count: { select: { likes: true, comments: SHOWN_COMMENTS_COUNT } },
      },
    });

    const sortedPosts = posts.sort(
      (a, b) => postIds.indexOf(a.id) - postIds.indexOf(b.id),
    );

    await this.cacheManager.set(cacheKey, sortedPosts, 60000); // 1 min cache for hot trending
    return withoutBlocked(sortedPosts);
  }

  // Search posts with Authority Weighting and Velocity ranking.
  // Param query: Keyword to search in captions
  async searchPosts(query: string, viewerId?: string): Promise<Post[]> {
    if (!query || query.length < 2) return [];

    const sanitizedQuery = query.toLowerCase();

    // Same public-content rule as semantic search: public posts from public
    // accounts, visible under moderation, never across a block.
    const posts = await this.prisma.post.findMany({
      where: {
        caption: { contains: sanitizedQuery, mode: 'insensitive' },
        visibility: 'PUBLIC',
        moderationStatus: 'VISIBLE',
        deletedAt: null,
        archivedAt: null,
        profile: {
          privacyLevel: 'PUBLIC',
          user: { deactivatedAt: null },
          AND: [await visibleToViewerWhere(this.prisma, viewerId)],
        },
      },
      include: {
        profile: { select: PUBLIC_PROFILE_SELECT },
        media: true,
        _count: { select: { likes: true, comments: SHOWN_COMMENTS_COUNT } },
      },
      take: 50,
    });

    // Rank by engagement alone: a plan does not move a post up.
    const ranked = posts.sort((a, b) => {
      const scoreA = a._count.likes * 1.2 + a._count.comments * 2.5;
      const scoreB = b._count.likes * 1.2 + b._count.comments * 2.5;

      return scoreB - scoreA;
    });
    return (await this.forViewer(ranked, viewerId)).slice(0, 15);
  }
}
