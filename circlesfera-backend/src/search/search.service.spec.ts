import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIService } from '../ai/ai.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserHardDeletedEvent } from '../users/events/user-hard-deleted.event.js';
import { SearchService } from './search.service.js';

describe('SearchService', () => {
  let service: SearchService;

  const mockPrismaService = {
    profile: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    hashtag: {
      findMany: vi.fn(),
    },
    follow: {
      findMany: vi.fn(),
    },
    searchHistory: {
      create: vi.fn().mockImplementation(() => Promise.resolve({})),
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

  describe('semanticSearchPosts', () => {
    it('returns empty array when query is too short', async () => {
      expect(await service.semanticSearchPosts('ab')).toEqual([]);
    });

    it('should use cache if available', async () => {
      mockCacheManager.get.mockResolvedValueOnce([{ id: 'cached-post' }]);

      const result = await service.semanticSearchPosts('nature photography');

      expect(result).toEqual([{ id: 'cached-post' }]);
      expect(mockCacheManager.get).toHaveBeenCalled();
      expect(mockAIService.generateEmbedding).not.toHaveBeenCalled();
    });

    it('returns empty array when no vector matches are found', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockPrismaService.$queryRaw.mockResolvedValueOnce([]);

      const result = await service.semanticSearchPosts(
        'space rocket',
        10,
        'viewer-1',
      );
      expect(result).toEqual([]);
      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
    });

    it('generates embedding, runs vector query for guest, enriches posts and caches result', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockPrismaService.$queryRaw.mockResolvedValueOnce([
        { id: 'post-1', distance: 0.15 },
      ]);
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'post-1',
        caption: 'Hello galaxy',
      });

      const result = await service.semanticSearchPosts('galaxy photo');

      expect(mockAIService.generateEmbedding).toHaveBeenCalledWith(
        'galaxy photo',
      );
      expect(result).toEqual([
        expect.objectContaining({
          id: 'post-1',
          caption: 'Hello galaxy',
          similarityScore: 0.85,
        }),
      ]);
      expect(mockCacheManager.set).toHaveBeenCalled();
    });

    it('catches and logs errors gracefully returning empty array', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockAIService.generateEmbedding.mockRejectedValueOnce(
        new Error('Model timeout'),
      );

      const result = await service.semanticSearchPosts('error query');
      expect(result).toEqual([]);
    });
  });

  describe('semanticSearchProfiles', () => {
    it('returns empty array when query is too short', async () => {
      expect(await service.semanticSearchProfiles('ab')).toEqual([]);
    });

    it('should use cache if available', async () => {
      mockCacheManager.get.mockResolvedValueOnce([{ id: 'cached-prof' }]);

      const result = await service.semanticSearchProfiles('software engineer');
      expect(result).toEqual([{ id: 'cached-prof' }]);
    });

    it('returns empty array when vector search returns no matches', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockPrismaService.$queryRaw.mockResolvedValueOnce([]);

      const result = await service.semanticSearchProfiles(
        'rare specialist',
        10,
        'viewer-1',
      );
      expect(result).toEqual([]);
    });

    it('runs vector query for guest, enriches profiles and caches result', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockPrismaService.$queryRaw.mockResolvedValueOnce([
        { profileId: 'prof-1', distance: 0.2 },
      ]);
      mockPrismaService.profile.findUnique.mockResolvedValueOnce({
        id: 'prof-1',
        username: 'alice',
        user: { id: 'u-1', role: 'USER' },
      });

      const result = await service.semanticSearchProfiles('musician');
      expect(result).toEqual([
        expect.objectContaining({
          id: 'prof-1',
          similarityScore: 0.8,
        }),
      ]);
      expect(mockCacheManager.set).toHaveBeenCalled();
    });

    it('catches and logs errors gracefully returning empty array', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockAIService.generateEmbedding.mockRejectedValueOnce(
        new Error('AI failure'),
      );

      const result = await service.semanticSearchProfiles('failed profile');
      expect(result).toEqual([]);
    });
  });

  describe('search', () => {
    it('returns empty results for queries under 2 characters', async () => {
      const result = await service.search('a');
      expect(result.users).toHaveLength(0);
      expect(result.hashtags).toHaveLength(0);
      expect(result.semanticPosts).toHaveLength(0);
      expect(result.semanticProfiles).toHaveLength(0);
    });

    it('returns cached combined search result when available', async () => {
      const cachedResponse = {
        users: [],
        hashtags: [{ id: 'h1', tag: 'travel' }],
        semanticPosts: [],
        semanticProfiles: [],
      };
      mockCacheManager.get.mockResolvedValueOnce(cachedResponse);

      const result = await service.search('travel');
      expect(result).toEqual(cachedResponse);
    });

    it('executes combined search, saves history, dedupes profiles, and handles history save failure', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      // History save rejects to test catch block
      mockPrismaService.searchHistory.create.mockReturnValueOnce(
        Promise.reject(new Error('DB connection drop')),
      );

      mockPrismaService.profile.findMany.mockResolvedValueOnce([
        {
          id: 'prof-1',
          username: 'artlover',
          fullName: 'Art Lover',
          verificationLevel: 'PRO',
          _count: { followers: 50 },
        },
      ]);
      mockPrismaService.hashtag.findMany.mockResolvedValueOnce([
        { id: 'h1', tag: 'art' },
      ]);
      mockPrismaService.follow.findMany.mockResolvedValue([]);
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      vi.spyOn(service, 'semanticSearchProfiles').mockResolvedValueOnce([
        { user: { id: 'prof-1' } },
        { profileId: 'prof-unique' },
        {},
      ]);

      const result = await service.search('art', 'viewer-1');

      expect(result.users).toHaveLength(1);
      expect(result.hashtags).toHaveLength(1);
      expect(result.semanticProfiles).toEqual([{ profileId: 'prof-unique' }]);
      expect(mockCacheManager.set).toHaveBeenCalled();
    });
  });

  describe('getHistory & clearHistory', () => {
    it('returns recent distinct search history', async () => {
      mockPrismaService.searchHistory.findMany.mockResolvedValueOnce([
        { query: 'cats' },
        { query: 'dogs' },
      ]);

      const history = await service.getHistory('viewer-1');
      expect(history).toEqual([{ query: 'cats' }, { query: 'dogs' }]);
      expect(mockPrismaService.searchHistory.findMany).toHaveBeenCalledWith({
        where: { profileId: 'viewer-1' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        distinct: ['query'],
      });
    });

    it('clears search history for profile', async () => {
      mockPrismaService.searchHistory.deleteMany.mockResolvedValueOnce({
        count: 4,
      });

      const res = await service.clearHistory('viewer-1');
      expect(res).toEqual({ count: 4 });
      expect(mockPrismaService.searchHistory.deleteMany).toHaveBeenCalledWith({
        where: { profileId: 'viewer-1' },
      });
    });
  });

  describe('searchUsers', () => {
    it('returns empty array when query is under 2 characters', async () => {
      expect(await service.searchUsers('x')).toEqual([]);
    });

    it('returns empty array when no profiles match', async () => {
      mockPrismaService.profile.findMany.mockResolvedValueOnce([]);
      expect(await service.searchUsers('nonexistent')).toEqual([]);
    });

    it('ranks users by followers, verification authority, and mutual connections', async () => {
      mockPrismaService.profile.findMany.mockResolvedValueOnce([
        {
          id: 'u-basic',
          username: 'basic_user',
          verificationLevel: 'BASIC',
          _count: { followers: 100 },
        },
        {
          id: 'u-pro',
          username: 'pro_user',
          verificationLevel: 'PRO',
          _count: { followers: 10 },
        },
        {
          id: 'viewer-self',
          username: 'viewer',
          verificationLevel: 'BASIC',
          _count: { followers: 5 },
        },
      ]);

      mockPrismaService.follow.findMany.mockImplementation(({ where }: any) => {
        if (where.followingId === 'u-pro') {
          return Promise.resolve([{ follower: { username: 'mutual_friend' } }]);
        }
        return Promise.resolve([]);
      });

      const results = await service.searchUsers('user', 'viewer-self');

      expect(results).toHaveLength(3);
      // u-pro has PRO verification (+20) and mutual connection (+5), ranking higher
      expect(results[0].id).toBe('u-pro');
      expect(results[0].followedByFriends).toEqual(['mutual_friend']);
    });
  });

  describe('getTrending', () => {
    it('returns cached trending posts if available', async () => {
      mockCacheManager.get.mockResolvedValueOnce([{ id: 'cached-trending' }]);

      const res = await service.getTrending(5);
      expect(res).toEqual([{ id: 'cached-trending' }]);
      expect(mockPrismaService.$queryRaw).not.toHaveBeenCalled();
    });

    it('returns empty array if no trending posts in window', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockPrismaService.$queryRaw.mockResolvedValueOnce([]);

      const res = await service.getTrending(10);
      expect(res).toEqual([]);
    });

    it('fetches, orders by velocity, caches and returns trending posts', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      mockPrismaService.$queryRaw.mockResolvedValueOnce([
        { id: 'post-hot', velocity_score: 99.5 },
        { id: 'post-warm', velocity_score: 42.1 },
      ]);
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        { id: 'post-warm', caption: 'Warm' },
        { id: 'post-hot', caption: 'Hot' },
      ]);

      const res = await service.getTrending(10);

      expect(res[0].id).toBe('post-hot');
      expect(res[1].id).toBe('post-warm');
      expect(mockCacheManager.set).toHaveBeenCalled();
    });
  });

  describe('searchPosts', () => {
    it('returns empty array when query is under 2 characters', async () => {
      expect(await service.searchPosts('a')).toEqual([]);
    });

    it('ranks posts by engagement and author verification authority', async () => {
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        {
          id: 'p-standard',
          profile: { verificationLevel: 'BASIC' },
          _count: { likes: 10, comments: 2 },
        },
        {
          id: 'p-verified',
          profile: { verificationLevel: 'OFFICIAL' },
          _count: { likes: 5, comments: 1 },
        },
      ]);

      const res = await service.searchPosts('sunset');
      expect(res).toHaveLength(2);
      // p-verified gets +100 authority bonus, ranking it first
      expect(res[0].id).toBe('p-verified');
    });
  });

  describe('handleUserHardDeleted', () => {
    it('should clear search history for all profiles of the deleted user', async () => {
      mockPrismaService.searchHistory.deleteMany.mockResolvedValue({
        count: 5,
      });

      await service.handleUserHardDeleted(
        new UserHardDeletedEvent({
          userId: 'user-1',
          profileIds: ['prof-1', 'prof-2'],
          mediaUrls: [],
        }),
      );

      expect(mockPrismaService.searchHistory.deleteMany).toHaveBeenCalledWith({
        where: { profileId: 'prof-1' },
      });
      expect(mockPrismaService.searchHistory.deleteMany).toHaveBeenCalledWith({
        where: { profileId: 'prof-2' },
      });
    });

    it('should do nothing if profileIds is empty', async () => {
      await service.handleUserHardDeleted(
        new UserHardDeletedEvent({
          userId: 'user-1',
          profileIds: [],
          mediaUrls: [],
        }),
      );

      expect(mockPrismaService.searchHistory.deleteMany).not.toHaveBeenCalled();
    });
  });
});
