import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIService } from '../ai/ai.service.js';
import { ExperimentsService } from '../experiments/experiments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FeedService } from './feed.service.js';
import { FEED_HOME_FOLLOWING_FIRST } from './feed-experiments.js';
import { FeedInboxService } from './feed-inbox.service.js';
import { FeedPreferencesService } from './feed-preferences.service.js';

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
    creatorSubscription: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    postUnlock: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    promotion: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    userSettings: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    profile: {
      findUnique: vi.fn().mockResolvedValue({ userId: 'account-1' }),
    },
    $queryRaw: vi.fn(),
  };

  const mockAIService = {};
  const mockCache = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  };

  const mockFeedInboxService = {
    getInbox: vi.fn().mockResolvedValue([]),
    getInboxCount: vi.fn().mockResolvedValue(0),
    removePostsFromInbox: vi.fn().mockResolvedValue(undefined),
    rebuildInbox: vi.fn().mockResolvedValue(0),
  };

  const mockFeedPreferences = {
    getFilterSets: vi.fn().mockResolvedValue({
      hiddenPostIds: [],
      hiddenAuthorIds: [],
      mutedKeywords: [],
    }),
  };

  const mockExperiments = {
    isFeatureEnabled: vi.fn().mockResolvedValue(false),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AIService, useValue: mockAIService },
        { provide: CACHE_MANAGER, useValue: mockCache },
        { provide: FeedInboxService, useValue: mockFeedInboxService },
        { provide: FeedPreferencesService, useValue: mockFeedPreferences },
        { provide: ExperimentsService, useValue: mockExperiments },
      ],
    }).compile();

    service = module.get<FeedService>(FeedService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getHybridFeed', () => {
    it('should fallback to trending feed if user is not logged in', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([
        { id: '1', type: 'POST', profile: { profile: {} }, likes: [] },
      ]);

      const result = (await service.getHybridFeed(null, {
        page: 1,
        limit: 10,
      })) as any;
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('1');
      // Anonymous browsing was never part of the asOf-session semantics
      // (DATA-003) — no scroll session to freeze.
      expect(result.asOf).toBeUndefined();
    });

    it('uses following feed when feed_home_following_first is on', async () => {
      mockExperiments.isFeatureEnabled.mockResolvedValueOnce(true);
      mockFeedInboxService.getInbox.mockResolvedValueOnce(['p1']);
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        { id: 'p1', likes: [], contentRating: 'GENERAL' },
      ]);
      mockFeedInboxService.getInboxCount.mockResolvedValueOnce(1);

      const result = (await service.getHybridFeed(
        'profile-1',
        { page: 1, limit: 10 },
        'account-1',
      )) as any;

      expect(mockExperiments.isFeatureEnabled).toHaveBeenCalledWith(
        FEED_HOME_FOLLOWING_FIRST,
        'account-1',
      );
      expect(mockPrismaService.$queryRaw).not.toHaveBeenCalled();
      expect(result.data[0].id).toBe('p1');
    });

    it('should query hybrid SQL if user has likes', async () => {
      // User has 1 like
      mockPrismaService.like.findMany.mockResolvedValue([{ postId: '1' }]);
      // Embedding lookup + hybrid ranking via $queryRaw
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([{ vector: '[0.1, 0.2]' }])
        .mockResolvedValueOnce([{ id: '2', final_score: 5.5 }]);
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

    it('generates and returns an asOf snapshot when the client sends none (DATA-003)', async () => {
      vi.useFakeTimers();
      const fixedNow = new Date('2026-03-01T12:00:00.000Z');
      vi.setSystemTime(fixedNow);
      try {
        mockPrismaService.like.findMany.mockResolvedValue([]);
        mockPrismaService.$queryRaw.mockResolvedValueOnce([
          { id: '3', final_score: 1 },
        ]);
        mockPrismaService.post.findMany.mockResolvedValueOnce([
          { id: '3', likes: [] },
        ]);

        const result = (await service.getHybridFeed('user-1', {
          page: 1,
          limit: 10,
        })) as any;

        expect(result.asOf).toBe(fixedNow.toISOString());
      } finally {
        vi.useRealTimers();
      }
    });

    it('filters out posts created after asOf in both the vector and non-vector SQL branches (DATA-003)', async () => {
      const fixedAsOf = '2026-01-01T00:00:00.000Z';

      mockPrismaService.like.findMany.mockResolvedValueOnce([]);
      mockPrismaService.$queryRaw.mockResolvedValueOnce([
        { id: 'non-vector', final_score: 1 },
      ]);
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        { id: 'non-vector', likes: [] },
      ]);

      await service.getHybridFeed('user-1', {
        page: 1,
        limit: 10,
        asOf: fixedAsOf,
      });

      const nonVectorStrings: TemplateStringsArray =
        mockPrismaService.$queryRaw.mock.calls[0][0];
      expect(nonVectorStrings.join('')).toContain('AND p."createdAt" <= ');

      mockPrismaService.like.findMany.mockResolvedValueOnce([
        { postId: 'liked-1' },
      ]);
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([{ vector: '[0.1, 0.2]' }])
        .mockResolvedValueOnce([{ id: 'vector', final_score: 1 }]);
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        { id: 'vector', likes: [] },
      ]);

      await service.getHybridFeed('user-1', {
        page: 1,
        limit: 10,
        asOf: fixedAsOf,
      });

      const vectorStrings: TemplateStringsArray =
        mockPrismaService.$queryRaw.mock.calls[2][0];
      expect(vectorStrings.join('')).toContain('AND p."createdAt" <= ');
    });

    it('freezes the ranking snapshot to the client-supplied asOf instead of NOW() (DATA-003)', async () => {
      mockPrismaService.like.findMany.mockResolvedValue([]);
      mockPrismaService.$queryRaw.mockResolvedValueOnce([
        { id: '4', final_score: 1 },
      ]);
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        { id: '4', likes: [] },
      ]);

      const fixedAsOf = '2026-01-01T00:00:00.000Z';
      const result = (await service.getHybridFeed('user-1', {
        page: 2,
        limit: 10,
        asOf: fixedAsOf,
      })) as any;

      expect(result.asOf).toBe(fixedAsOf);
      // The tagged-template SQL call's interpolated values include the
      // resolved asOf Date, not a fresh NOW()-equivalent.
      const call = mockPrismaService.$queryRaw.mock.calls[0];
      const interpolatedValues = call.slice(1);
      expect(
        interpolatedValues.some(
          (v: unknown) => v instanceof Date && v.toISOString() === fixedAsOf,
        ),
      ).toBe(true);
    });
  });

  describe('getFollowingFeed', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockCache.get.mockResolvedValue(null);
      mockFeedInboxService.getInbox.mockResolvedValue([]);
      mockFeedInboxService.getInboxCount.mockResolvedValue(0);
      mockFeedPreferences.getFilterSets.mockResolvedValue({
        hiddenPostIds: [],
        hiddenAuthorIds: [],
        mutedKeywords: [],
      });
      mockPrismaService.mute.findMany.mockResolvedValue([]);
      mockPrismaService.postUnlock.findMany.mockResolvedValue([]);
      mockPrismaService.userSettings.findUnique.mockResolvedValue({
        contentPreference: 'GENERAL',
        blurSensitiveContent: true,
      });
    });

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

    it('does not hide MATURE posts when the viewer prefers GENERAL', async () => {
      mockPrismaService.follow.findMany.mockResolvedValue([
        { followingId: 'user-2' },
      ]);
      mockPrismaService.post.findMany.mockResolvedValue([
        { id: '1', likes: [], contentRating: 'MATURE' },
      ]);
      mockPrismaService.post.count.mockResolvedValue(1);

      await service.getFollowingFeed('user-1', { page: 1, limit: 10 });

      const where = mockPrismaService.post.findMany.mock.calls[0][0].where;
      expect(where.contentRating).toBeUndefined();
    });

    it('blurs MATURE posts in following when blur is enabled', async () => {
      mockPrismaService.follow.findMany.mockResolvedValue([
        { followingId: 'user-2' },
      ]);
      mockPrismaService.post.findMany.mockResolvedValue([
        { id: '1', likes: [], contentRating: 'MATURE' },
      ]);
      mockPrismaService.post.count.mockResolvedValue(1);

      const result = await service.getFollowingFeed('user-1', {
        page: 1,
        limit: 10,
      });

      expect(result.data[0].shouldBlurSensitive).toBe(true);
    });

    it('prunes stale/deleted post IDs from Redis inbox when DB returns fewer posts', async () => {
      mockFeedInboxService.getInbox.mockResolvedValueOnce([
        'post-active',
        'post-deleted',
      ]);
      mockFeedInboxService.getInboxCount.mockResolvedValueOnce(2);

      // Only post-active exists in DB
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        { id: 'post-active', likes: [] },
      ]);

      const result = await service.getFollowingFeed('user-1', {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('post-active');
      expect(mockFeedInboxService.removePostsFromInbox).toHaveBeenCalledWith(
        'user-1',
        ['post-deleted'],
      );
    });

    it('triggers background rebuild of inbox when empty on page 1', async () => {
      mockFeedInboxService.getInbox.mockResolvedValueOnce([]);
      mockPrismaService.follow.findMany.mockResolvedValue([
        { followingId: 'user-2' },
      ]);
      mockPrismaService.post.findMany.mockResolvedValue([]);
      mockPrismaService.post.count.mockResolvedValue(0);

      await service.getFollowingFeed('user-1', { page: 1, limit: 10 });

      expect(mockFeedInboxService.rebuildInbox).toHaveBeenCalledWith('user-1');
    });

    it('handles Redis failure (null) safely by falling back to SQL without triggering rebuild (REDIS-002)', async () => {
      // Redis unavailable returns null
      mockFeedInboxService.getInbox.mockResolvedValueOnce(null);

      mockPrismaService.follow.findMany.mockResolvedValue([
        { followingId: 'user-2' },
      ]);
      mockPrismaService.post.findMany.mockResolvedValue([
        { id: 'sql-post-1', likes: [] },
      ]);
      mockPrismaService.post.count.mockResolvedValue(1);

      const result = await service.getFollowingFeed('user-1', {
        page: 1,
        limit: 10,
      });

      // Safely returned SQL results
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('sql-post-1');

      // Crucial: Must NOT attempt rebuild into a failing/unavailable Redis instance
      expect(mockFeedInboxService.rebuildInbox).not.toHaveBeenCalled();
    });

    it('falls back to posts length when getInboxCount returns null during Redis failure (REDIS-002)', async () => {
      mockFeedInboxService.getInbox.mockResolvedValueOnce(['post-1']);
      // getInboxCount returns null due to Redis failure
      mockFeedInboxService.getInboxCount.mockResolvedValueOnce(null);

      mockPrismaService.post.findMany.mockResolvedValueOnce([
        { id: 'post-1', likes: [] },
      ]);

      const result = await service.getFollowingFeed('user-1', {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('catches and logs warning when prune stale posts fails', async () => {
      mockFeedInboxService.getInbox.mockResolvedValueOnce(['p1', 'p2']);
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        { id: 'p1', likes: [] },
      ]);
      mockFeedInboxService.removePostsFromInbox.mockRejectedValueOnce(
        new Error('Redis fail'),
      );

      await service.getFollowingFeed('user-1', { page: 1, limit: 10 });
      expect(mockFeedInboxService.removePostsFromInbox).toHaveBeenCalledWith(
        'user-1',
        ['p2'],
      );
    });

    it('catches and logs warning when background rebuild fails', async () => {
      mockFeedInboxService.getInbox.mockResolvedValueOnce([]);
      mockFeedInboxService.rebuildInbox.mockRejectedValueOnce(
        new Error('Rebuild fail'),
      );
      mockPrismaService.follow.findMany.mockResolvedValueOnce([
        { followingId: 'u2' },
      ]);
      mockPrismaService.post.findMany.mockResolvedValueOnce([]);
      mockPrismaService.post.count.mockResolvedValueOnce(0);

      await service.getFollowingFeed('user-1', { page: 1, limit: 10 });
      expect(mockFeedInboxService.rebuildInbox).toHaveBeenCalledWith('user-1');
    });

    it('filters hidden posts, authors, and muted keywords in SQL fallback', async () => {
      mockFeedInboxService.getInbox.mockResolvedValueOnce(null);
      mockFeedPreferences.getFilterSets.mockResolvedValueOnce({
        hiddenPostIds: ['hid-post'],
        hiddenAuthorIds: ['hid-author'],
        mutedKeywords: ['spam'],
      });
      mockPrismaService.follow.findMany.mockResolvedValueOnce([
        { followingId: 'hid-author' },
        { followingId: 'good-author' },
      ]);
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        { id: 'p1', caption: 'Clean post', likes: [] },
        { id: 'p2', caption: 'Contains SPAM here', likes: [] },
      ]);
      mockPrismaService.post.count.mockResolvedValueOnce(2);

      const res = await service.getFollowingFeed('user-1', {
        page: 1,
        limit: 10,
      });

      // p2 contains 'spam' so it should be filtered out
      expect(res.data).toHaveLength(1);
      expect(res.data[0].id).toBe('p1');
    });

    it('locks premium posts in following feed if not subscribed or unlocked', async () => {
      mockFeedInboxService.getInbox.mockResolvedValueOnce(['prem-1']);
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        {
          id: 'prem-1',
          profileId: 'creator-x',
          isPremium: true,
          media: [{ url: 'secret.mp4', standardUrl: 'std.mp4' }],
          likes: [],
        },
      ]);
      mockPrismaService.profile.findUnique.mockResolvedValueOnce({
        userId: 'u1',
      });
      mockPrismaService.postUnlock.findMany.mockResolvedValueOnce([]);

      const res = await service.getFollowingFeed('viewer-1', {
        page: 1,
        limit: 10,
      });

      expect(res.data[0].isLocked).toBe(true);
      expect(res.data[0].media[0].url).toBe('');
    });
  });

  describe('getHybridFeed additional edge cases', () => {
    it('returns cached hybrid feed when cache hit occurs', async () => {
      mockCache.get.mockResolvedValueOnce({ data: [{ id: 'cached-hybrid' }] });

      const res = (await service.getHybridFeed('user-1', {
        page: 1,
        limit: 10,
      })) as any;
      expect(res.data[0].id).toBe('cached-hybrid');
    });

    it('handles user with zero likes by running non-AI vector query', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrismaService.like.findMany.mockResolvedValueOnce([]);
      mockPrismaService.$queryRaw.mockResolvedValueOnce([
        {
          id: 'post-no-ai',
          social_weight: 2.0,
          ai_score: 0.9,
          final_score: 8.8,
        },
      ]);
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        {
          id: 'post-no-ai',
          performanceScore: 50,
          likes: [{ profileId: 'user-1' }],
        },
      ]);
      mockPrismaService.profile.findUnique.mockResolvedValueOnce({
        userId: 'acc-1',
      });

      const res = (await service.getHybridFeed('user-1', {
        page: 1,
        limit: 10,
      })) as any;
      expect(res.data[0].id).toBe('post-no-ai');
      expect(res.data[0].recommendationReason).toBe('close_friend');
      expect(res.data[0].recommendationSignals).toContain('close_friend');
      expect(res.data[0].recommendationSignals).toContain('interest_match');
      expect(res.data[0].recommendationSignals).toContain('high_engagement');
    });

    it('falls back to trending when hybrid query returns 0 posts, carrying asOf forward (DATA-003)', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrismaService.like.findMany.mockResolvedValueOnce([]);
      mockPrismaService.$queryRaw.mockResolvedValueOnce([]); // 0 posts
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        { id: 'trending-fallback', likes: [] },
      ]);
      mockPrismaService.post.count.mockResolvedValueOnce(1);

      const fixedAsOf = '2026-01-01T00:00:00.000Z';
      const res = (await service.getHybridFeed('user-1', {
        page: 1,
        limit: 10,
        asOf: fixedAsOf,
      })) as any;
      expect(res.data[0].id).toBe('trending-fallback');
      expect(res.asOf).toBe(fixedAsOf);
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { lte: new Date(fixedAsOf) },
          }),
        }),
      );
    });

    it('catches hybrid query errors and falls back to trending, carrying asOf forward (DATA-003)', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrismaService.like.findMany.mockRejectedValueOnce(
        new Error('SQL crash'),
      );
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        { id: 'trending-after-error', likes: [] },
      ]);
      mockPrismaService.post.count.mockResolvedValueOnce(1);

      const fixedAsOf = '2026-01-01T00:00:00.000Z';
      const res = (await service.getHybridFeed('user-1', {
        page: 1,
        limit: 10,
        asOf: fixedAsOf,
      })) as any;
      expect(res.data[0].id).toBe('trending-after-error');
      expect(res.asOf).toBe(fixedAsOf);
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { lte: new Date(fixedAsOf) },
          }),
        }),
      );
    });

    it('locks premium posts in hybrid feed and handles recommendation signals', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrismaService.like.findMany.mockResolvedValueOnce([
        { postId: 'p-liked' },
      ]);
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([{ vector: '[0.1]' }])
        .mockResolvedValueOnce([
          {
            id: 'prem-hybrid',
            social_weight: 1.5,
            ai_score: 0.2,
            final_score: 3.0,
          },
        ]);
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        {
          id: 'prem-hybrid',
          profileId: 'author-y',
          isPremium: true,
          media: [{ url: 'locked.mp4' }],
          likes: [],
        },
      ]);
      mockPrismaService.profile.findUnique.mockResolvedValueOnce({
        userId: 'u-viewer',
      });
      mockPrismaService.postUnlock.findMany.mockResolvedValueOnce([]);

      const res = (await service.getHybridFeed('viewer-prof', {
        page: 1,
        limit: 10,
      })) as any;
      expect(res.data[0].isLocked).toBe(true);
      expect(res.data[0].recommendationReason).toBe('following');
    });
  });

  describe('getTrendingFeed and injectPromotions', () => {
    it('returns cached trending feed if present', async () => {
      mockCache.get.mockResolvedValueOnce({
        data: [{ id: 'trending-cached' }],
      });

      const res = (await service.getHybridFeed(null, {
        page: 1,
        limit: 10,
      })) as any;
      expect(res.data[0].id).toBe('trending-cached');
    });

    it('injects promotions matching viewer location into feed with >= 5 posts', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrismaService.like.findMany.mockResolvedValueOnce([]);
      mockPrismaService.$queryRaw.mockResolvedValueOnce([
        { id: 'post-1' },
        { id: 'post-2' },
        { id: 'post-3' },
        { id: 'post-4' },
        { id: 'post-5' },
      ]);
      const posts = Array.from({ length: 5 }, (_, i) => ({
        id: `post-${i + 1}`,
        type: 'POST',
        likes: [],
        media: [],
        contentRating: 'GENERAL',
      }));
      mockPrismaService.post.findMany
        .mockResolvedValueOnce(posts) // Hybrid hydrated posts
        .mockResolvedValueOnce([
          { id: 'promoted-p1', caption: 'Buy now', likes: [], media: [] },
        ]); // Promoted post hydration
      mockPrismaService.post.count.mockResolvedValueOnce(5);

      mockPrismaService.profile.findUnique
        .mockResolvedValueOnce({ userId: 'viewer-user' }) // viewerContentSettings
        .mockResolvedValueOnce({ userId: 'viewer-user' }) // postUnlock
        .mockResolvedValueOnce({
          userId: 'viewer-user',
          location: 'Madrid, Spain',
        }); // injectPromotions

      mockPrismaService.promotion.findMany.mockResolvedValueOnce([
        {
          id: 'promo-1',
          targetId: 'promoted-p1',
          countries: 'Spain, France',
        },
        {
          id: 'promo-nomatch',
          targetId: 'promoted-p2',
          countries: 'Germany',
        },
      ]);

      const res = (await service.getHybridFeed('viewer-prof', {
        page: 1,
        limit: 10,
      })) as any;

      // The promoted post should be injected
      const injected = res.data.find((p: any) => p.isPromoted);
      expect(injected).toBeDefined();
      expect(injected.id).toBe('promoted-p1');
      expect(injected.promotionId).toBe('promo-1');
    });

    it('returns default content settings when viewer profile does not exist', async () => {
      mockFeedInboxService.getInbox.mockResolvedValueOnce(null);
      mockFeedPreferences.getFilterSets.mockResolvedValueOnce({
        hiddenPostIds: [],
        hiddenAuthorIds: [],
        mutedKeywords: [],
      });
      mockPrismaService.profile.findUnique.mockResolvedValue(null);
      mockCache.get.mockResolvedValue(null);
      mockPrismaService.follow.findMany.mockResolvedValueOnce([]);
      mockPrismaService.mute.findMany.mockResolvedValueOnce([]);
      mockPrismaService.post.findMany.mockResolvedValueOnce([]);
      mockPrismaService.post.count.mockResolvedValueOnce(0);

      const res = (await service.getFollowingFeed('missing-profile', {
        page: 1,
        limit: 10,
      })) as any;
      expect(res.data).toEqual([]);
    });

    it('filters active mutes in following feed fallback', async () => {
      mockFeedInboxService.getInbox.mockResolvedValueOnce(null);
      mockFeedPreferences.getFilterSets.mockResolvedValueOnce({
        hiddenPostIds: [],
        hiddenAuthorIds: [],
        mutedKeywords: [],
      });
      mockPrismaService.profile.findUnique.mockResolvedValueOnce({
        userId: 'u1',
      });
      mockCache.get.mockResolvedValue(null);
      mockPrismaService.follow.findMany.mockResolvedValueOnce([
        { followingId: 'muted-1' },
      ]);
      mockPrismaService.mute.findMany.mockResolvedValueOnce([
        { mutedId: 'muted-1' },
      ]);
      mockPrismaService.post.findMany.mockResolvedValueOnce([]);
      mockPrismaService.post.count.mockResolvedValueOnce(0);

      const res = await service.getFollowingFeed('user-1', {
        page: 1,
        limit: 10,
      });
      expect(res.data).toEqual([]);
    });

    it('locks premium posts and tests mutes in trending feed for authenticated viewer', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrismaService.like.findMany.mockResolvedValueOnce([]);
      mockPrismaService.$queryRaw.mockResolvedValueOnce([]); // 0 posts triggers getTrendingFeed(page, limit, skip, profileId)
      mockPrismaService.profile.findUnique
        .mockResolvedValueOnce({ userId: 'u-viewer' }) // getViewerContentSettings in hybrid
        .mockResolvedValueOnce({ userId: 'u-viewer' }) // getViewerContentSettings in trending
        .mockResolvedValueOnce({ userId: 'u-viewer' }); // postUnlock in trending
      mockPrismaService.mute.findMany.mockResolvedValueOnce([
        { mutedId: 'muted-creator' },
      ]);
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        {
          id: 'prem-trend',
          profileId: 'creator-z',
          isPremium: true,
          media: [{ url: 'secret.mp4', standardUrl: 'std.mp4' }],
          likes: [],
        },
      ]);
      mockPrismaService.post.count.mockResolvedValueOnce(1);
      mockPrismaService.postUnlock.findMany.mockResolvedValueOnce([]);

      const res = (await service.getHybridFeed('viewer-auth', {
        page: 1,
        limit: 10,
      })) as any;
      expect(res.data).toHaveLength(1);
      expect(res.data[0].isLocked).toBe(true);
      expect(res.data[0].media[0].url).toBe('');
    });

    it('sets recommendationReason to interest and popular when social_weight is neutral', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrismaService.like.findMany.mockResolvedValueOnce([]);
      mockPrismaService.$queryRaw.mockResolvedValueOnce([
        { id: 'p-interest', social_weight: 1.0, ai_score: 0.9, final_score: 5 },
        { id: 'p-popular', social_weight: 1.0, ai_score: 0.1, final_score: 4 },
      ]);
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        { id: 'p-interest', performanceScore: 5, likes: [] },
        { id: 'p-popular', performanceScore: 50, likes: [] },
      ]);
      mockPrismaService.profile.findUnique.mockResolvedValueOnce({
        userId: 'u1',
      });

      const res = (await service.getHybridFeed('viewer-1', {
        page: 1,
        limit: 10,
      })) as any;
      expect(res.data[0].recommendationReason).toBe('interest');
      expect(res.data[1].recommendationReason).toBe('popular');
    });
  });
});
