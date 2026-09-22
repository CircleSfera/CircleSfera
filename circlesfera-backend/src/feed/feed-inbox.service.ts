import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { Redis } from 'ioredis';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  USER_HARD_DELETED_EVENT,
  type UserHardDeletedEvent,
} from '../users/events/user-hard-deleted.event.js';

@Injectable()
export class FeedInboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeedInboxService.name);
  private redisClient: Redis | null = null;
  private readonly INBOX_LIMIT = 1000;

  constructor(
    private readonly configService: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const port = this.configService.get<number>('REDIS_PORT') || 6379;

    const password =
      this.configService.get<string>('REDIS_PASSWORD') || undefined;

    this.redisClient = new Redis({
      host,
      port,
      password,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
    });

    this.redisClient.on('connect', () => {
      this.logger.log(`Connected to Redis for Feed Inbox at ${host}:${port}`);
    });

    this.redisClient.on('error', (err) => {
      this.logger.error(`Redis Feed Inbox connection error: ${err.message}`);
    });
  }

  onModuleDestroy() {
    if (this.redisClient) {
      this.redisClient.disconnect();
    }
  }

  // Pushes a new post ID to the inbox of multiple followers.
  // Limits each inbox to a predefined capacity to save memory.
  async fanoutToFollowers(
    followerIds: string[],
    postId: string,
  ): Promise<void> {
    if (!this.redisClient || followerIds.length === 0) return;

    try {
      const pipeline = this.redisClient.pipeline();

      for (const followerId of followerIds) {
        const key = `user:${followerId}:inbox`;
        pipeline.zadd(key, Date.now(), postId);
        pipeline.zremrangebyrank(key, 0, -(this.INBOX_LIMIT + 1));
      }

      await pipeline.exec();
      this.logger.debug(
        `Successfully fanned out post ${postId} to ${followerIds.length} followers.`,
      );
    } catch (error) {
      this.logger.error(`Error fanning out post ${postId}: ${error}`);
      throw error;
    }
  }

  // Reads the inbox for a specific user with pagination.
  // Returns string[] of post IDs on success (can be [] if genuinely empty).
  // Returns null if Redis is unavailable or throws an error,
  // preventing infrastructure failure from masquerading as an empty feed.
  async getInbox(
    profileId: string,
    skip: number,
    limit: number,
  ): Promise<string[] | null> {
    if (!this.redisClient) {
      this.logger.warn(
        `Redis client unavailable when reading inbox for profile ${profileId}`,
      );
      return null;
    }

    const key = `user:${profileId}:inbox`;
    try {
      const end = skip + limit - 1;
      return await this.redisClient.zrevrange(key, skip, end);
    } catch (error) {
      this.logger.error(
        `Redis failure reading inbox for user ${profileId}: ${error}`,
      );
      return null;
    }
  }

  // Utility to check if a user's inbox is empty (cache miss or inactive user).
  // Uses ZCARD for Sorted Set.
  // Throws if Redis is unavailable to prevent failure from masquerading as empty.
  async isInboxEmpty(profileId: string): Promise<boolean> {
    if (!this.redisClient) {
      this.logger.warn(
        `Redis client unavailable when checking inbox empty for ${profileId}`,
      );
      throw new Error('Redis client unavailable');
    }
    const key = `user:${profileId}:inbox`;
    try {
      const length = await this.redisClient.zcard(key);
      return length === 0;
    } catch (error) {
      this.logger.error(
        `Redis error checking if inbox is empty for ${profileId}: ${error}`,
      );
      throw error;
    }
  }

  // Smart Fan-out strategy:
  // Standard creators (< 5000 followers) get fan-out on write (push to all followers).
  // Celebrity creators (>= 5000 followers) skip write fanout to avoid thundering herd.
  async fanoutHybrid(
    authorId: string,
    followerIds: string[],
    postId: string,
  ): Promise<{ strategy: 'WRITE' | 'READ_HYBRID'; fannedOutCount: number }> {
    const CELEBRITY_THRESHOLD = 5000;
    if (followerIds.length >= CELEBRITY_THRESHOLD) {
      this.logger.log(
        `Author ${authorId} has ${followerIds.length} followers (>= ${CELEBRITY_THRESHOLD}). Using Fan-out on Read strategy for post ${postId}.`,
      );
      return { strategy: 'READ_HYBRID', fannedOutCount: 0 };
    }

    await this.fanoutToFollowers(followerIds, postId);
    return { strategy: 'WRITE', fannedOutCount: followerIds.length };
  }

  // Invalidates Redis feed cache for a user.
  async invalidateUserFeedCache(profileId: string): Promise<void> {
    if (!this.redisClient) return;
    try {
      const key = `user:${profileId}:inbox`;
      await this.redisClient.del(key);
      this.logger.debug(`Invalidated feed inbox cache for user ${profileId}`);
    } catch (error) {
      this.logger.error(
        `Failed to invalidate feed cache for user ${profileId}: ${error}`,
      );
    }
  }

  // Gets the total count of posts in the user's inbox.
  // Returns number on success, or null if Redis is unavailable/fails.
  async getInboxCount(profileId: string): Promise<number | null> {
    if (!this.redisClient) {
      this.logger.warn(
        `Redis client unavailable when reading inbox count for profile ${profileId}`,
      );
      return null;
    }
    const key = `user:${profileId}:inbox`;
    try {
      const count = await this.redisClient.zcard(key);
      return count;
    } catch (error) {
      this.logger.error(
        `Error getting inbox count for user ${profileId}: ${error}`,
      );
      return null;
    }
  }

  // Evicts specific post IDs from a user's inbox (e.g. upon post deletion or stale eviction).
  async removePostsFromInbox(
    profileId: string,
    postIds: string[],
  ): Promise<void> {
    if (!this.redisClient || postIds.length === 0) return;

    try {
      const key = `user:${profileId}:inbox`;
      await this.redisClient.zrem(key, ...postIds);
      this.logger.debug(
        `Pruned ${postIds.length} posts from inbox for profile ${profileId}.`,
      );
    } catch (error) {
      this.logger.error(
        `Error pruning posts from inbox for profile ${profileId}: ${error}`,
      );
    }
  }

  // Reconstructs the user's feed inbox from canonical database state.
  // Fetches recent published posts from accepted followed profiles
  // and repopulates the Redis Sorted Set.
  async rebuildInbox(profileId: string): Promise<number> {
    if (!this.redisClient) return 0;

    try {
      // 1. Purge existing derived state
      await this.invalidateUserFeedCache(profileId);

      // 2. Query canonical follow relationships
      const follows = await this.prisma.follow.findMany({
        where: { followerId: profileId, status: 'ACCEPTED' },
        select: { followingId: true },
      });

      const followingIds = follows.map((f) => f.followingId);
      if (followingIds.length === 0) return 0;

      // 3. Query canonical posts from followed profiles
      const recentPosts = await this.prisma.post.findMany({
        where: {
          profileId: { in: followingIds },
          moderationStatus: { in: ['VISIBLE', 'FLAGGED'] },
          scheduledStatus: 'PUBLISHED',
        },
        select: { id: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: this.INBOX_LIMIT,
      });

      if (recentPosts.length === 0) return 0;

      // 4. Repopulate Redis ZSET in pipeline
      const key = `user:${profileId}:inbox`;
      const pipeline = this.redisClient.pipeline();
      for (const post of recentPosts) {
        pipeline.zadd(key, post.createdAt.getTime(), post.id);
      }
      await pipeline.exec();

      this.logger.debug(
        `Successfully rebuilt inbox for profile ${profileId} with ${recentPosts.length} posts.`,
      );
      return recentPosts.length;
    } catch (error) {
      this.logger.error(
        `Error rebuilding inbox for profile ${profileId}: ${error}`,
      );
      return 0;
    }
  }

  // Purges all Redis derived inbox state when a user account is hard-deleted.
  @OnEvent(USER_HARD_DELETED_EVENT)
  async handleUserHardDeleted(event: UserHardDeletedEvent): Promise<void> {
    if (!event.profileIds || event.profileIds.length === 0) return;
    for (const profileId of event.profileIds) {
      await this.invalidateUserFeedCache(profileId);
    }
    this.logger.log(
      `Purged feed inbox caches for hard-deleted user ${event.userId} (profiles: ${event.profileIds.join(', ')})`,
    );
  }
}
