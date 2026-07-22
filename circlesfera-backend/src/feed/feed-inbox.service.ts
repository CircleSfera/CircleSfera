import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class FeedInboxService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeedInboxService.name);
  private redisClient: Redis | null = null;
  private readonly INBOX_LIMIT = 1000;

  constructor(private readonly configService: ConfigService) {}

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

  /**
   * Pushes a new post ID to the inbox of multiple followers.
   * Limits each inbox to a predefined capacity to save memory.
   */
  async fanoutToFollowers(
    followerIds: string[],
    postId: string,
  ): Promise<void> {
    if (!this.redisClient || followerIds.length === 0) return;

    try {
      const pipeline = this.redisClient.pipeline();

      for (const followerId of followerIds) {
        const key = `user:${followerId}:inbox`;
        pipeline.lpush(key, postId);
        pipeline.ltrim(key, 0, this.INBOX_LIMIT - 1);
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

  /**
   * Reads the inbox for a specific user with pagination.
   */
  async getInbox(
    userId: string,
    skip: number,
    limit: number,
  ): Promise<string[]> {
    if (!this.redisClient) return [];

    const key = `user:${userId}:inbox`;
    try {
      // Redis LRANGE is inclusive on both ends, so we subtract 1 from the end index
      const end = skip + limit - 1;
      return await this.redisClient.lrange(key, skip, end);
    } catch (error) {
      this.logger.error(`Error getting inbox for user ${userId}: ${error}`);
      return [];
    }
  }

  /**
   * Utility to check if a user's inbox is empty (cache miss or inactive user).
   */
  async isInboxEmpty(userId: string): Promise<boolean> {
    if (!this.redisClient) return true;
    const key = `user:${userId}:inbox`;
    const length = await this.redisClient.llen(key);
    return length === 0;
  }

  /**
   * Smart Fan-out strategy:
   * Standard creators (< 5000 followers) get fan-out on write (push to all followers).
   * Celebrity creators (>= 5000 followers) skip write fanout to avoid thundering herd.
   */
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

  /**
   * Invalidates Redis feed cache for a user.
   */
  async invalidateUserFeedCache(userId: string): Promise<void> {
    if (!this.redisClient) return;
    try {
      const key = `user:${userId}:inbox`;
      await this.redisClient.del(key);
      this.logger.debug(`Invalidated feed inbox cache for user ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to invalidate feed cache for user ${userId}: ${error}`,
      );
    }
  }

  /**
   * Gets the total count of posts in the user's inbox
   */
  async getInboxCount(userId: string): Promise<number> {
    if (!this.redisClient) return 0;
    const key = `user:${userId}:inbox`;
    try {
      return await this.redisClient.llen(key);
    } catch (error) {
      this.logger.error(
        `Error getting inbox count for user ${userId}: ${error}`,
      );
      return 0;
    }
  }
}
