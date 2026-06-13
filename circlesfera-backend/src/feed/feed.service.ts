import { Inject, Injectable } from '@nestjs/common';
import { Visibility } from '@prisma/client';
import { AIService } from '../ai/ai.service.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for metadata reflection
import {
  createPaginatedResult,
  PaginationDto,
} from '../common/dto/pagination.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class FeedService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
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
          WITH social_graph AS (
            SELECT "followingId", 1.5 AS weight
            FROM "follows"
            WHERE "followerId" = ${userId} AND "status" = 'ACCEPTED'
            UNION
            SELECT "friendId" AS "followingId", 2.0 AS weight
            FROM "close_friends"
            WHERE "userId" = ${userId}
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
            
          ORDER BY final_score DESC
          LIMIT ${limit}
          OFFSET ${skip}
        `;
      } else {
         // Hybrid Query WITHOUT AI Vector (User has no likes yet)
         postsRaw = await this.prisma.$queryRaw`
          WITH social_graph AS (
            SELECT "followingId", 1.5 AS weight
            FROM "follows"
            WHERE "followerId" = ${userId} AND "status" = 'ACCEPTED'
            UNION
            SELECT "friendId" AS "followingId", 2.0 AS weight
            FROM "close_friends"
            WHERE "userId" = ${userId}
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

      const formattedPosts = sortedPosts.map((post: any) => {
        const { likes, ...rest } = post;
        const isLiked = Array.isArray(likes) ? likes.length > 0 : false;
        
        // Attach algorithm reasoning score for debugging
        const rawData = postsRaw.find((r) => r.id === post.id);
        
        return {
          ...rest,
          isLiked,
          algScore: rawData?.final_score,
        };
      });

      // Simple mock total since accurate counts are heavy for algorithmic feeds
      return createPaginatedResult(formattedPosts, 1000, page, limit);

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

    const following = await this.prisma.follow.findMany({
      where: { followerId: userId, status: 'ACCEPTED' },
      select: { followingId: true },
    });

    const followingIds = following.map((f) => f.followingId);
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

    const formattedPosts = posts.map((post) => {
      const { likes, ...rest } = post;
      const isLiked = Array.isArray(likes) ? likes.length > 0 : false;
      return { ...rest, isLiked };
    });

    return createPaginatedResult(formattedPosts, total, page, limit);
  }

  /**
   * Fallback / Trending feed logic
   */
  private async getTrendingFeed(page: number, limit: number, skip: number, currentUserId?: string | null) {
    const posts = await this.prisma.post.findMany({
      where: { visibility: Visibility.PUBLIC, moderationStatus: 'VISIBLE' },
      orderBy: [{ performanceScore: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
      include: {
        user: { include: { profile: true } },
        media: true,
        _count: { select: { likes: true, comments: true } },
        likes: currentUserId ? { where: { userId: currentUserId }, take: 1 } : false,
      },
    });

    const formattedPosts = posts.map((post) => {
      const { likes, ...rest } = post;
      const isLiked = currentUserId && Array.isArray(likes) ? likes.length > 0 : false;
      return { ...rest, isLiked };
    });

    return createPaginatedResult(formattedPosts, 1000, page, limit);
  }
}
