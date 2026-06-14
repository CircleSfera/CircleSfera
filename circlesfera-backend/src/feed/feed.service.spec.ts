import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIService } from '../ai/ai.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FeedService } from './feed.service.js';

describe('FeedService', () => {
  let service: FeedService;

  const mockPrismaService = {
    like: {
      findMany: vi.fn(),
    },
    post: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    follow: {
      findMany: vi.fn(),
    },
    mute: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRaw: vi.fn(),
  };

  const mockAIService = {};
  const mockCache = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AIService, useValue: mockAIService },
        { provide: CACHE_MANAGER, useValue: mockCache },
      ],
    }).compile();

    service = module.get<FeedService>(FeedService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getHybridFeed', () => {
    it('should fallback to trending feed if user is not logged in', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([
        { id: '1', type: 'POST', user: { profile: {} }, likes: [] },
      ]);

      const result = (await service.getHybridFeed(null, {
        page: 1,
        limit: 10,
      })) as any;
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('1');
    });

    it('should query hybrid SQL if user has likes', async () => {
      // User has 1 like
      mockPrismaService.like.findMany.mockResolvedValue([{ postId: '1' }]);
      // That post has an embedding
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        { embedding: '[0.1, 0.2]' },
      ]);
      // SQL query raw returns a post
      mockPrismaService.$queryRaw.mockResolvedValue([
        { id: '2', final_score: 5.5 },
      ]);
      // Hydrating returns the full post
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        { id: '2', likes: [] },
      ]);

      const result = (await service.getHybridFeed('user-1', {
        page: 1,
        limit: 10,
      })) as any;

      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('2');
      expect((result.data[0] as any).algScore).toBe(5.5);
    });
  });

  describe('getFollowingFeed', () => {
    it('should return chronological feed of following', async () => {
      mockPrismaService.follow.findMany.mockResolvedValue([
        { followingId: 'user-2' },
      ]);
      mockPrismaService.post.findMany.mockResolvedValue([
        { id: '1', likes: [] },
      ]);
      mockPrismaService.post.count.mockResolvedValue(1);

      const result = await service.getFollowingFeed('user-1', {
        page: 1,
        limit: 10,
      });

      expect(mockPrismaService.post.findMany).toHaveBeenCalled();
      expect(result.data).toHaveLength(1);
    });
  });
});
