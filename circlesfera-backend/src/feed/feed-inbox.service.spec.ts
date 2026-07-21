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
});
