import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIService } from '../ai/ai.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SearchService } from './search.service.js';

describe('SearchService', () => {
  let service: SearchService;

  const mockPrismaService = {
    user: {
      findMany: vi.fn(),
    },
    hashtag: {
      findMany: vi.fn(),
    },
    follow: {
      findMany: vi.fn(),
    },
    searchHistory: {
      create: vi.fn().mockReturnValue({ catch: vi.fn() }),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    postEmbedding: {
      findMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    post: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  };

  const mockAIService = {
    generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    calculateSimilarity: vi.fn().mockReturnValue(0.8),
  };

  const mockCacheManager = {
    get: vi.fn(),
    set: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AIService, useValue: mockAIService },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('search', () => {
    it('should return users and hashtags', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([{ id: '1', _count: { followers: 0 } }]);
      mockPrismaService.hashtag.findMany.mockResolvedValue([{ id: 'tag-1' }]);
      mockPrismaService.follow.findMany.mockResolvedValue([]);

      const result = await service.search('query', 'user-1');

      expect(result.users).toHaveLength(1);
      expect(result.hashtags).toHaveLength(1);
      expect(mockPrismaService.searchHistory.create).toHaveBeenCalled();
    });

    it('should return empty results for short queries', async () => {
      const result = await service.search('a');
      expect(result.users).toHaveLength(0);
      expect(result.hashtags).toHaveLength(0);
    });
  });

  describe('semanticSearchPosts', () => {
    it('should use cache if available', async () => {
      mockCacheManager.get.mockResolvedValue([0.1, 0.2, 0.3]);
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      await service.semanticSearchPosts('query');

      expect(mockCacheManager.get).toHaveBeenCalled();
      expect(mockAIService.generateEmbedding).not.toHaveBeenCalled();
    });

    it('should generate embedding and cache it if not in cache', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockPrismaService.$queryRaw.mockResolvedValue([
        { id: '1', distance: 0.2 },
      ]);
      mockPrismaService.post.findUnique.mockResolvedValue({ id: '1' });

      const result = await service.semanticSearchPosts('query');

      expect(mockAIService.generateEmbedding).toHaveBeenCalled();
      expect(mockCacheManager.set).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });
});
