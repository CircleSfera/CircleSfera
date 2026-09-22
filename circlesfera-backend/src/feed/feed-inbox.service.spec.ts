import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserHardDeletedEvent } from '../users/events/user-hard-deleted.event.js';
import { FeedInboxService } from './feed-inbox.service.js';

vi.mock('ioredis', () => {
  return {
    Redis: vi.fn().mockImplementation(function (this: any, opts: any) {
      this.on = vi.fn((event: string, cb: (...args: any[]) => void) => {
        if (event === 'connect') cb();
        if (event === 'error') cb(new Error('redis error'));
      });
      this.disconnect = vi.fn();
      if (opts?.retryStrategy) opts.retryStrategy(2);
    }),
  };
});

describe('FeedInboxService', () => {
  let service: FeedInboxService;

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === 'REDIS_HOST') return 'localhost';
      if (key === 'REDIS_PORT') return 6379;
      return null;
    }),
  };

  const mockPrismaService = {
    follow: {
      findMany: vi.fn(),
    },
    post: {
      findMany: vi.fn(),
    },
  };

  const mockPipeline = {
    zadd: vi.fn().mockReturnThis(),
    zremrangebyrank: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };

  const mockRedisClient = {
    pipeline: vi.fn(() => mockPipeline),
    zrevrange: vi.fn(),
    zcard: vi.fn(),
    zrem: vi.fn().mockResolvedValue(1),
    llen: vi.fn(),
    del: vi.fn().mockResolvedValue(1),
    disconnect: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedInboxService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<FeedInboxService>(FeedInboxService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('lifecycle onModuleInit and onModuleDestroy', () => {
    it('initializes Redis client and handles disconnect', () => {
      service.onModuleInit();
      expect((service as any).redisClient).toBeDefined();
      service.onModuleDestroy();
      expect((service as any).redisClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('fanoutToFollowers', () => {
    it('should return early if followerIds is empty', async () => {
      await expect(
        service.fanoutToFollowers([], 'post-1'),
      ).resolves.not.toThrow();
    });

    it('fans out to followers via pipeline and logs completion', async () => {
      // @ts-expect-error - inject mocked redis client
      service.redisClient = mockRedisClient;
      await service.fanoutToFollowers(['user-1', 'user-2'], 'post-1');
      expect(mockRedisClient.pipeline).toHaveBeenCalled();
      expect(mockPipeline.zadd).toHaveBeenCalledTimes(2);
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('rethrows error when pipeline.exec fails', async () => {
      // @ts-expect-error - inject mocked redis client
      service.redisClient = mockRedisClient;
      mockPipeline.exec.mockRejectedValueOnce(new Error('pipeline error'));
      await expect(
        service.fanoutToFollowers(['user-1'], 'post-1'),
      ).rejects.toThrow('pipeline error');
    });
  });

  describe('getInbox (REDIS-002 Failure Distinction)', () => {
    it('should return null if redis client is not connected', async () => {
      const inbox = await service.getInbox('user-1', 0, 10);
      expect(inbox).toBeNull();
    });

    it('should return null when Redis throws an error instead of masquerading as empty', async () => {
      // @ts-expect-error - inject mocked redis client
      service.redisClient = mockRedisClient;
      mockRedisClient.zrevrange.mockRejectedValueOnce(
        new Error('Redis connection lost'),
      );

      const inbox = await service.getInbox('user-1', 0, 10);
      expect(inbox).toBeNull();
    });

    it('should return post IDs from Redis sorted set when connected', async () => {
      // @ts-expect-error - inject mocked redis client
      service.redisClient = mockRedisClient;
      mockRedisClient.zrevrange.mockResolvedValueOnce(['post-1', 'post-2']);

      const inbox = await service.getInbox('user-1', 0, 10);
      expect(inbox).toEqual(['post-1', 'post-2']);
      expect(mockRedisClient.zrevrange).toHaveBeenCalledWith(
        'user:user-1:inbox',
        0,
        9,
      );
    });

    it('should return empty array when inbox is genuinely empty', async () => {
      // @ts-expect-error - inject mocked redis client
      service.redisClient = mockRedisClient;
      mockRedisClient.zrevrange.mockResolvedValueOnce([]);

      const inbox = await service.getInbox('user-1', 0, 10);
      expect(inbox).toEqual([]);
    });
  });

  describe('isInboxEmpty (REDIS-001 ZCARD & REDIS-002 Observable Failure)', () => {
    it('should throw if redis client is not connected instead of masquerading as empty', async () => {
      await expect(service.isInboxEmpty('user-1')).rejects.toThrow(
        'Redis client unavailable',
      );
    });

    it('should call zcard (not llen) on the sorted set and return true when 0 (REDIS-001)', async () => {
      // @ts-expect-error - inject mocked redis client
      service.redisClient = mockRedisClient;
      mockRedisClient.zcard.mockResolvedValueOnce(0);

      const empty = await service.isInboxEmpty('user-1');

      expect(empty).toBe(true);
      expect(mockRedisClient.zcard).toHaveBeenCalledWith('user:user-1:inbox');
      expect(mockRedisClient.llen).not.toHaveBeenCalled();
    });

    it('should call zcard and return false when inbox has items', async () => {
      // @ts-expect-error - inject mocked redis client
      service.redisClient = mockRedisClient;
      mockRedisClient.zcard.mockResolvedValueOnce(5);

      const empty = await service.isInboxEmpty('user-1');

      expect(empty).toBe(false);
      expect(mockRedisClient.zcard).toHaveBeenCalledWith('user:user-1:inbox');
    });

    it('should rethrow error when zcard fails (REDIS-002)', async () => {
      // @ts-expect-error - inject mocked redis client
      service.redisClient = mockRedisClient;
      mockRedisClient.zcard.mockRejectedValueOnce(
        new Error('CLUSTERDOWN Hash slot not served'),
      );

      await expect(service.isInboxEmpty('user-1')).rejects.toThrow(
        'CLUSTERDOWN Hash slot not served',
      );
    });
  });

  describe('getInboxCount (REDIS-002)', () => {
    it('should return null when redis client is not connected', async () => {
      const count = await service.getInboxCount('user-1');
      expect(count).toBeNull();
    });

    it('should return null when zcard throws error', async () => {
      // @ts-expect-error - inject mocked redis client
      service.redisClient = mockRedisClient;
      mockRedisClient.zcard.mockRejectedValueOnce(new Error('Timeout'));

      const count = await service.getInboxCount('user-1');
      expect(count).toBeNull();
    });

    it('should return count on success', async () => {
      // @ts-expect-error - inject mocked redis client
      service.redisClient = mockRedisClient;
      mockRedisClient.zcard.mockResolvedValueOnce(42);

      const count = await service.getInboxCount('user-1');
      expect(count).toBe(42);
    });
  });

  describe('fanoutHybrid', () => {
    it('should use READ_HYBRID strategy for celebrity creators with >= 5000 followers', async () => {
      const followers = Array.from({ length: 5000 }, (_, i) => `follower-${i}`);
      const result = await service.fanoutHybrid(
        'star-user',
        followers,
        'post-celebrity-1',
      );
      expect(result.strategy).toBe('READ_HYBRID');
      expect(result.fannedOutCount).toBe(0);
    });

    it('should use WRITE strategy for standard creators with < 5000 followers', async () => {
      const followers = ['user-1', 'user-2'];
      const result = await service.fanoutHybrid(
        'normal-user',
        followers,
        'post-1',
      );
      expect(result.strategy).toBe('WRITE');
    });
  });

  describe('invalidateUserFeedCache (Deletion Semantics)', () => {
    it('should delete user inbox key from Redis', async () => {
      // @ts-expect-error - inject mocked redis client
      service.redisClient = mockRedisClient;

      await service.invalidateUserFeedCache('profile-123');

      expect(mockRedisClient.del).toHaveBeenCalledWith(
        'user:profile-123:inbox',
      );
    });

    it('should handle missing redis client safely', async () => {
      await expect(
        service.invalidateUserFeedCache('user-1'),
      ).resolves.not.toThrow();
    });

    it('catches and logs error when del fails', async () => {
      // @ts-expect-error - inject mocked redis client
      service.redisClient = mockRedisClient;
      mockRedisClient.del.mockRejectedValueOnce(new Error('del failed'));
      await expect(
        service.invalidateUserFeedCache('user-1'),
      ).resolves.not.toThrow();
    });
  });

  describe('removePostsFromInbox (Stale Post Eviction)', () => {
    it('should evict specific post IDs from user inbox', async () => {
      // @ts-expect-error - inject mocked redis client
      service.redisClient = mockRedisClient;

      await service.removePostsFromInbox('profile-1', [
        'post-deleted-1',
        'post-deleted-2',
      ]);

      expect(mockRedisClient.zrem).toHaveBeenCalledWith(
        'user:profile-1:inbox',
        'post-deleted-1',
        'post-deleted-2',
      );
    });

    it('should do nothing if postIds is empty', async () => {
      // @ts-expect-error - inject mocked redis client
      service.redisClient = mockRedisClient;

      await service.removePostsFromInbox('profile-1', []);

      expect(mockRedisClient.zrem).not.toHaveBeenCalled();
    });

    it('catches and logs error when zrem fails', async () => {
      // @ts-expect-error - inject mocked redis client
      service.redisClient = mockRedisClient;
      mockRedisClient.zrem.mockRejectedValueOnce(new Error('zrem failed'));
      await expect(
        service.removePostsFromInbox('profile-1', ['p-1']),
      ).resolves.not.toThrow();
    });
  });

  describe('rebuildInbox (Rebuild Semantics)', () => {
    it('should return 0 when redis client is not available', async () => {
      const count = await service.rebuildInbox('profile-1');
      expect(count).toBe(0);
    });

    it('should return 0 if user follows no profiles', async () => {
      // @ts-expect-error - inject mocked redis client
      service.redisClient = mockRedisClient;
      mockPrismaService.follow.findMany.mockResolvedValueOnce([]);

      const count = await service.rebuildInbox('profile-1');

      expect(count).toBe(0);
      expect(mockRedisClient.del).toHaveBeenCalledWith('user:profile-1:inbox');
      expect(mockPrismaService.post.findMany).not.toHaveBeenCalled();
    });

    it('returns 0 when followed profiles have no recent posts', async () => {
      // @ts-expect-error - inject mocked redis client
      service.redisClient = mockRedisClient;
      mockPrismaService.follow.findMany.mockResolvedValueOnce([
        { followingId: 'creator-A' },
      ]);
      mockPrismaService.post.findMany.mockResolvedValueOnce([]);

      const count = await service.rebuildInbox('viewer-empty');
      expect(count).toBe(0);
    });

    it('catches error and returns 0 when rebuild throws', async () => {
      // @ts-expect-error - inject mocked redis client
      service.redisClient = mockRedisClient;
      mockPrismaService.follow.findMany.mockRejectedValueOnce(
        new Error('DB crash'),
      );

      const count = await service.rebuildInbox('viewer-err');
      expect(count).toBe(0);
    });

    it('should query canonical DB posts from followed profiles and populate Redis ZSET', async () => {
      // @ts-expect-error - inject mocked redis client
      service.redisClient = mockRedisClient;

      mockPrismaService.follow.findMany.mockResolvedValueOnce([
        { followingId: 'creator-A' },
        { followingId: 'creator-B' },
      ]);

      const now = new Date();
      const earlier = new Date(now.getTime() - 60000);
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        { id: 'post-1', createdAt: now },
        { id: 'post-2', createdAt: earlier },
      ]);

      const count = await service.rebuildInbox('viewer-1');

      expect(count).toBe(2);
      // 1. Invalidates existing inbox
      expect(mockRedisClient.del).toHaveBeenCalledWith('user:viewer-1:inbox');

      // 2. Queries follows
      expect(mockPrismaService.follow.findMany).toHaveBeenCalledWith({
        where: { followerId: 'viewer-1', status: 'ACCEPTED' },
        select: { followingId: true },
      });

      // 3. Queries canonical published posts
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith({
        where: {
          profileId: { in: ['creator-A', 'creator-B'] },
          moderationStatus: { in: ['VISIBLE', 'FLAGGED'] },
          scheduledStatus: 'PUBLISHED',
        },
        select: { id: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      });

      // 4. Pipelined zadd
      expect(mockPipeline.zadd).toHaveBeenCalledWith(
        'user:viewer-1:inbox',
        now.getTime(),
        'post-1',
      );
      expect(mockPipeline.zadd).toHaveBeenCalledWith(
        'user:viewer-1:inbox',
        earlier.getTime(),
        'post-2',
      );
      expect(mockPipeline.exec).toHaveBeenCalledOnce();
    });
  });

  describe('handleUserHardDeleted (Hard Deletion Event)', () => {
    it('should purge inboxes for all profiles of the hard-deleted user', async () => {
      // @ts-expect-error - inject mocked redis client
      service.redisClient = mockRedisClient;

      const event = new UserHardDeletedEvent({
        userId: 'user-to-delete',
        profileIds: ['profile-main', 'profile-secondary'],
        mediaUrls: [],
      });

      await service.handleUserHardDeleted(event);

      expect(mockRedisClient.del).toHaveBeenCalledWith(
        'user:profile-main:inbox',
      );
      expect(mockRedisClient.del).toHaveBeenCalledWith(
        'user:profile-secondary:inbox',
      );
    });

    it('should safely handle events with no profileIds', async () => {
      // @ts-expect-error - inject mocked redis client
      service.redisClient = mockRedisClient;

      const event = new UserHardDeletedEvent({
        userId: 'user-to-delete',
        profileIds: [],
        mediaUrls: [],
      });

      await service.handleUserHardDeleted(event);
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });
  });
});
