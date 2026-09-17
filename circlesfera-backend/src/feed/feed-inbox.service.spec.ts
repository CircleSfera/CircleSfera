import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserHardDeletedEvent } from '../users/events/user-hard-deleted.event.js';
import { FeedInboxService } from './feed-inbox.service.js';

describe('FeedInboxService (DATA-001)', () => {
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

  describe('fanoutToFollowers', () => {
    it('should return early if followerIds is empty', async () => {
      await expect(
        service.fanoutToFollowers([], 'post-1'),
      ).resolves.not.toThrow();
    });
  });

  describe('getInbox', () => {
    it('should return empty array if redis client is not connected', async () => {
      const inbox = await service.getInbox('user-1', 0, 10);
      expect(inbox).toEqual([]);
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
  });

  describe('isInboxEmpty', () => {
    it('should return true if redis client is not connected', async () => {
      const empty = await service.isInboxEmpty('user-1');
      expect(empty).toBe(true);
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

  describe('invalidateUserFeedCache (DATA-001 Deletion Semantics)', () => {
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
  });

  describe('removePostsFromInbox (DATA-001 Stale Post Eviction)', () => {
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
  });

  describe('rebuildInbox (DATA-001 Rebuild Semantics)', () => {
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

  describe('handleUserHardDeleted (DATA-001 Hard Deletion Event)', () => {
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
