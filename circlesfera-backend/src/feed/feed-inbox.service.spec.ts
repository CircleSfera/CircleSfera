import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedInboxService } from './feed-inbox.service.js';

describe('FeedInboxService', () => {
  let service: FeedInboxService;

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === 'REDIS_HOST') return 'localhost';
      if (key === 'REDIS_PORT') return 6379;
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedInboxService,
        { provide: ConfigService, useValue: mockConfigService },
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
      const result = await service.fanoutHybrid('star-user', followers, 'post-celebrity-1');
      expect(result.strategy).toBe('READ_HYBRID');
      expect(result.fannedOutCount).toBe(0);
    });

    it('should use WRITE strategy for standard creators with < 5000 followers', async () => {
      const followers = ['user-1', 'user-2'];
      const result = await service.fanoutHybrid('normal-user', followers, 'post-1');
      expect(result.strategy).toBe('WRITE');
    });
  });

  describe('invalidateUserFeedCache', () => {
    it('should handle cache invalidation safely', async () => {
      await expect(service.invalidateUserFeedCache('user-1')).resolves.not.toThrow();
    });
  });
});
