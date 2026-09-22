/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ContentRating, Visibility } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIService } from '../ai/ai.service.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { assertVideoUrlDuration } from '../common/utils/media-duration.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SystemSettingsService } from '../system-settings/system-settings.service.js';
import type { CreatePostDto } from './dto/create-post.dto.js';
import { PostsService } from './posts.service.js';
import { PostDistributionService } from './services/post-distribution.service.js';
import { PostMediaCleanupService } from './services/post-media-cleanup.service.js';
import { PostPaywallService } from './services/post-paywall.service.js';

vi.mock('../common/utils/media-duration.util.js', () => ({
  assertVideoUrlDuration: vi.fn().mockResolvedValue(undefined),
}));

describe('PostsService', () => {
  let service: PostsService;

  const mockPrismaService = {
    $transaction: vi.fn(),
    post: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    profile: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    follow: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    postMedia: {
      createMany: vi.fn(),
      create: vi.fn(),
    },
    hashtag: {
      upsert: vi.fn().mockResolvedValue({ id: 'hash-1', name: 'world' }),
    },
    postHashtag: {
      create: vi.fn(),
    },
    place: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    audio: {
      findUnique: vi.fn(),
    },
  };

  const mockAIService = {
    generateEmbedding: vi.fn(() => [0.1, 0.2, 0.3]),
    moderateContent: vi.fn().mockResolvedValue({
      isSafe: true,
      categories: {},
      reason: 'Safe content',
    }),
  };

  const mockPostPaywallService = {
    applyPaywall: vi.fn(async (posts) => posts),
  };

  const mockPostDistributionService = {
    dispatchPostPublished: vi.fn().mockResolvedValue(undefined),
  };

  const mockPostMediaCleanupService = {
    cleanupMedia: vi.fn().mockResolvedValue(undefined),
  };

  const mockAnalyticsService = {
    trackPostView: vi.fn().mockResolvedValue(undefined),
  };

  const mockSystemSettingsService = {
    isEnabled: vi.fn(async () => true),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AIService, useValue: mockAIService },
        {
          provide: AnalyticsService,
          useValue: mockAnalyticsService,
        },
        {
          provide: SystemSettingsService,
          useValue: mockSystemSettingsService,
        },
        { provide: PostPaywallService, useValue: mockPostPaywallService },
        {
          provide: PostDistributionService,
          useValue: mockPostDistributionService,
        },
        {
          provide: PostMediaCleanupService,
          useValue: mockPostMediaCleanupService,
        },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('throws ForbiddenException when content posting is disabled', async () => {
      mockSystemSettingsService.isEnabled.mockResolvedValueOnce(false);
      await expect(
        service.create('user-1', { caption: 'test' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('validates premium price bounds when isPremium is true', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue({
        accountType: 'CREATOR',
      });

      await expect(
        service.create('user-1', { isPremium: true, priceCents: 50 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create('user-1', { isPremium: true, priceCents: 200000 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create('user-1', { isPremium: true }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects premium posts from PERSONAL accounts', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValueOnce({
        accountType: 'PERSONAL',
      });

      await expect(
        service.create('user-1', { isPremium: true, priceCents: 500 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('validates audio track exists and resolves offset when audioId provided', async () => {
      mockPrismaService.audio.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.create('user-1', { audioId: 'missing-audio' }),
      ).rejects.toThrow('AUDIO_NOT_FOUND');

      mockPrismaService.audio.findUnique.mockResolvedValueOnce({
        id: 'aud-1',
        duration: 45,
      });

      const mockTx = {
        post: {
          create: vi.fn().mockResolvedValue({ id: 'post-aud' }),
        },
        postMedia: { createMany: vi.fn(), create: vi.fn() },
        hashtag: { upsert: vi.fn() },
        postHashtag: { create: vi.fn() },
      };
      mockPrismaService.$transaction.mockImplementation(async (cb) =>
        cb(mockTx),
      );
      mockPrismaService.post.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'post-aud',
        media: [],
      });

      const result = await service.create('user-1', {
        audioId: 'aud-1',
        audioStartMs: 5000,
      });
      expect(result).toBeDefined();
      expect(mockTx.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            audioId: 'aud-1',
            audioStartMs: 5000,
          }),
        }),
      );
    });

    it('rejects FRAME when no media items provided', async () => {
      await expect(
        service.create('user-1', {
          type: 'FRAME',
          media: [],
        }),
      ).rejects.toThrow('FRAME_MEDIA_REQUIRED');
    });

    it('rejects a Frame that is not video', async () => {
      await expect(
        service.create('user-1', {
          type: 'FRAME',
          media: [{ url: 'url1', type: 'image' }],
        }),
      ).rejects.toThrow('FRAME_VIDEO_ONLY');
    });

    it('validates duration for FRAME video', async () => {
      const mockTx = {
        post: {
          create: vi.fn().mockResolvedValue({ id: 'frame-1' }),
        },
        postMedia: { createMany: vi.fn(), create: vi.fn() },
        hashtag: { upsert: vi.fn() },
        postHashtag: { create: vi.fn() },
      };
      mockPrismaService.$transaction.mockImplementation(async (cb) =>
        cb(mockTx),
      );
      mockPrismaService.post.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'frame-1',
        media: [{ url: 'https://vid.mp4', type: 'video' }],
      });

      await service.create('user-1', {
        type: 'FRAME',
        media: [{ url: 'https://vid.mp4', type: 'video' }],
      });

      expect(assertVideoUrlDuration).toHaveBeenCalledWith(
        'FRAME',
        'https://vid.mp4',
      );
    });

    it('validates duration for POST video media items', async () => {
      const mockTx = {
        post: {
          create: vi.fn().mockResolvedValue({ id: 'post-vid' }),
        },
        postMedia: { createMany: vi.fn(), create: vi.fn() },
        hashtag: { upsert: vi.fn() },
        postHashtag: { create: vi.fn() },
      };
      mockPrismaService.$transaction.mockImplementation(async (cb) =>
        cb(mockTx),
      );
      mockPrismaService.post.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'post-vid',
        media: [{ url: 'https://vid.mp4', type: 'video' }],
      });

      await service.create('user-1', {
        type: 'POST',
        media: [{ url: 'https://vid.mp4', type: 'video' }],
      });

      expect(assertVideoUrlDuration).toHaveBeenCalledWith(
        'POST',
        'https://vid.mp4',
      );
    });

    it('throws BadRequestException when AI moderation flags content', async () => {
      mockAIService.moderateContent.mockResolvedValueOnce({
        flagged: true,
        reason: 'Violates policy',
      });

      await expect(
        service.create('user-1', {
          caption: 'Bad content',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('supports scheduled posts and defers distribution', async () => {
      const futureDate = new Date(Date.now() + 60000).toISOString();
      const mockTx = {
        post: {
          create: vi.fn().mockResolvedValue({ id: 'scheduled-post' }),
        },
        postMedia: { createMany: vi.fn(), create: vi.fn() },
        hashtag: { upsert: vi.fn() },
        postHashtag: { create: vi.fn() },
      };
      mockPrismaService.$transaction.mockImplementation(async (cb) =>
        cb(mockTx),
      );
      mockPrismaService.post.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'scheduled-post',
        scheduledAt: new Date(futureDate),
        scheduledStatus: 'SCHEDULED',
      });

      const result = await service.create('user-1', {
        caption: 'Scheduled for later',
        scheduledAt: new Date(futureDate),
      });

      expect(result).toBeDefined();
      expect(
        mockPostDistributionService.dispatchPostPublished,
      ).not.toHaveBeenCalled();
    });

    it('should extract hashtags and mentions and run transaction', async () => {
      const profileId = 'user-1';
      const dto = {
        caption: 'Hello #world #alpha @user2',
        type: 'POST' as const,
        tags: [{ profileId: 'tagged-user', x: 0.1, y: 0.2 }],
        isPremium: true,
        priceCents: 500,
        contentRating: ContentRating.GENERAL,
        visibility: Visibility.PUBLIC,
      };

      const mockTx = {
        post: {
          create: vi.fn().mockResolvedValue({ id: 'post-1' }),
          findUniqueOrThrow: vi
            .fn()
            .mockResolvedValue({ id: 'post-1', media: [] }),
        },
        postMedia: { createMany: vi.fn(), create: vi.fn() },
        hashtag: { upsert: vi.fn().mockResolvedValue({ id: 'tag-1' }) },
        postHashtag: { create: vi.fn() },
      };

      mockPrismaService.$transaction.mockImplementation(
        async (
          callback: (tx: Partial<PrismaService>) => Promise<unknown>,
        ): Promise<unknown> =>
          callback(mockTx as unknown as Partial<PrismaService>),
      );

      mockPrismaService.profile.findUnique.mockResolvedValueOnce({
        accountType: 'CREATOR',
      });
      mockPrismaService.post.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'post-1',
        caption: 'Hello #world #alpha @user2',
        media: [],
        author: { profile: { username: 'user1' } },
        _count: { likes: 0, comments: 0 },
      });

      const _result = await service.create(profileId, dto);

      expect(mockTx.post.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tags: {
              create: [{ profileId: 'tagged-user', x: 0.1, y: 0.2 }],
            },
          }),
        }),
      );
      expect(mockTx.hashtag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tag: 'alpha' },
        }),
      );
      expect(mockTx.hashtag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tag: 'world' },
        }),
      );

      expect(
        mockPostDistributionService.dispatchPostPublished,
      ).toHaveBeenCalledWith(expect.objectContaining({ id: 'post-1' }), {
        caption: 'Hello #world #alpha @user2',
        uniqueMentions: ['user2'],
      });
    });

    it('should create post with multiple media items', async () => {
      const profileId = 'user-1';
      const dto: CreatePostDto = {
        caption: 'Post with media',
        media: [
          { url: 'url1', type: 'image' },
          { url: 'url2', type: 'image' },
        ],
        type: 'POST',
      };

      const mockTx = {
        post: {
          create: vi.fn().mockResolvedValue({ id: 'post-1' }),
          findUniqueOrThrow: vi
            .fn()
            .mockResolvedValue({ id: 'post-1', media: [] }),
        },
        postMedia: { createMany: vi.fn(), create: vi.fn() },
        hashtag: { upsert: vi.fn() },
        postHashtag: { create: vi.fn() },
      };

      mockPrismaService.$transaction.mockImplementation(
        async (
          callback: (tx: Partial<PrismaService>) => Promise<unknown>,
        ): Promise<unknown> =>
          callback(mockTx as unknown as Partial<PrismaService>),
      );

      mockPrismaService.post.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'post-multi',
        caption: 'Multi media post',
        media: [{ id: 'm1' }, { id: 'm2' }],
        author: { profile: { username: 'user1' } },
        _count: { likes: 0, comments: 0 },
      });

      await service.create(profileId, dto);

      expect(mockTx.postMedia.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ url: 'url1', type: 'image', order: 0 }),
          expect.objectContaining({ url: 'url2', type: 'image', order: 1 }),
        ]),
      });
    });
  });

  describe('getByTag', () => {
    it('retrieves posts by hashtag with cursor pagination and injects isLiked', async () => {
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        {
          id: 'post-tag-1',
          caption: '#nature',
          likes: [{ profileId: 'user-1' }],
        },
      ]);
      mockPrismaService.post.count.mockResolvedValueOnce(1);

      const result = await service.getByTag('nature', {
        page: 2,
        limit: 5,
        cursor: 'post-cursor',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].isLiked).toBe(false);
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 1,
          take: 5,
          cursor: { id: 'post-cursor' },
        }),
      );
    });

    it('retrieves posts by hashtag with page-based offset without cursor', async () => {
      mockPrismaService.post.findMany.mockResolvedValueOnce([]);
      mockPrismaService.post.count.mockResolvedValueOnce(0);

      const result = await service.getByTag('travel', {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(0);
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated posts with trending sort and currentProfileId', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([
        {
          id: '1',
          type: 'POST',
          profile: { profile: {} },
          likes: [{ profileId: 'current-user' }],
        },
      ]);
      mockPrismaService.post.count.mockResolvedValue(1);

      const result = await service.findAll(
        { page: 2, limit: 10, cursor: 'c-1' },
        'trending',
        'current-user',
      );
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(mockPostPaywallService.applyPaywall).toHaveBeenCalled();
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { likes: { _count: 'desc' } },
          cursor: { id: 'c-1' },
          skip: 1,
        }),
      );
    });

    it('handles posts when currentProfileId is undefined and sort is latest', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([]);
      mockPrismaService.post.count.mockResolvedValue(0);

      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(0);
      expect(result.meta.nextCursor).toBeUndefined();
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
          skip: 0,
        }),
      );
    });
  });

  describe('getFramesFeed', () => {
    it('returns frames feed with currentProfileId and cursor', async () => {
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        {
          id: 'frame-1',
          type: 'FRAME',
          likes: [{ profileId: 'viewer-1' }],
        },
      ]);
      mockPrismaService.post.count.mockResolvedValueOnce(1);

      const result = await service.getFramesFeed(
        { page: 1, limit: 5, cursor: 'prev-id' },
        'viewer-1',
      );

      expect(result.data).toHaveLength(1);
      expect(mockPostPaywallService.applyPaywall).toHaveBeenCalled();
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'FRAME' }),
          cursor: { id: 'prev-id' },
          skip: 1,
        }),
      );
    });

    it('returns frames feed when currentProfileId is omitted', async () => {
      mockPrismaService.post.findMany.mockResolvedValueOnce([]);
      mockPrismaService.post.count.mockResolvedValueOnce(0);

      const result = await service.getFramesFeed({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(0);
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException if post is not found', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce(null);
      await expect(service.findOne('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('allows author to view post even if profile is private', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-1',
        profileId: 'author-1',
        visibility: Visibility.PUBLIC,
        profile: {
          id: 'author-1',
          user: { settings: { privacyLevel: Visibility.PRIVATE } },
        },
        likes: [],
      });

      const post = await service.findOne('p-1', 'author-1');
      expect(post).toBeDefined();
      expect(mockAnalyticsService.trackPostView).toHaveBeenCalledWith(
        'p-1',
        'author-1',
      );
    });

    it('throws ForbiddenException if profile is private and viewer is not following', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-1',
        profileId: 'author-1',
        visibility: Visibility.PUBLIC,
        profile: {
          id: 'author-1',
          user: { settings: { privacyLevel: Visibility.PRIVATE } },
        },
        likes: [],
      });

      await expect(service.findOne('p-1', undefined)).rejects.toThrow(
        'This account is private',
      );

      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-1',
        profileId: 'author-1',
        visibility: Visibility.PUBLIC,
        profile: {
          id: 'author-1',
          user: { settings: { privacyLevel: Visibility.PRIVATE } },
        },
        likes: [],
      });
      mockPrismaService.follow.findUnique.mockResolvedValueOnce(null);

      await expect(service.findOne('p-1', 'other-user')).rejects.toThrow(
        'This account is private',
      );
    });

    it('allows viewer to view private profile post if follow is ACCEPTED', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-1',
        profileId: 'author-1',
        visibility: Visibility.PUBLIC,
        profile: {
          id: 'author-1',
          user: { settings: { privacyLevel: Visibility.PRIVATE } },
        },
        likes: [],
      });
      mockPrismaService.follow.findUnique.mockResolvedValueOnce({
        status: 'ACCEPTED',
      });

      const post = await service.findOne('p-1', 'follower-1');
      expect(post).toBeDefined();
    });

    it('throws ForbiddenException if post visibility is PRIVATE and viewer is not author', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-1',
        profileId: 'author-1',
        visibility: Visibility.PRIVATE,
        profile: {
          id: 'author-1',
          user: { settings: { privacyLevel: Visibility.PUBLIC } },
        },
        likes: [],
      });

      await expect(service.findOne('p-1', 'other-user')).rejects.toThrow(
        'This post is private',
      );
    });

    it('checks follower status when post visibility is FOLLOWERS', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-1',
        profileId: 'author-1',
        visibility: Visibility.FOLLOWERS,
        profile: {
          id: 'author-1',
          user: { settings: { privacyLevel: Visibility.PUBLIC } },
        },
        likes: [],
      });
      await expect(service.findOne('p-1', undefined)).rejects.toThrow(
        'This post is for followers only',
      );

      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-1',
        profileId: 'author-1',
        visibility: Visibility.FOLLOWERS,
        profile: {
          id: 'author-1',
          user: { settings: { privacyLevel: Visibility.PUBLIC } },
        },
        likes: [],
      });
      mockPrismaService.follow.findUnique.mockResolvedValueOnce({
        status: 'PENDING',
      });
      await expect(service.findOne('p-1', 'viewer-1')).rejects.toThrow(
        'This post is for followers only',
      );

      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-1',
        profileId: 'author-1',
        visibility: Visibility.FOLLOWERS,
        profile: {
          id: 'author-1',
          user: { settings: { privacyLevel: Visibility.PUBLIC } },
        },
        likes: [{ profileId: 'viewer-1' }],
      });
      mockPrismaService.follow.findUnique.mockResolvedValueOnce({
        status: 'ACCEPTED',
      });
      const result = await service.findOne('p-1', 'viewer-1');
      expect(result.isLiked).toBe(true);
    });

    it('catches and logs error if analytics trackPostView fails', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-analytics',
        profileId: 'author-1',
        visibility: Visibility.PUBLIC,
        profile: {
          id: 'author-1',
          user: { settings: { privacyLevel: Visibility.PUBLIC } },
        },
        likes: [],
      });
      mockAnalyticsService.trackPostView.mockRejectedValueOnce(
        new Error('Redis down'),
      );

      const post = await service.findOne('p-analytics', 'author-1');
      expect(post).toBeDefined();
      await new Promise((resolve) => setImmediate(resolve));
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to track view in findOne:',
        expect.any(Error),
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe('findByUser', () => {
    it('throws NotFoundException when user is not found', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.findByUser('unknown', { page: 1, limit: 10 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when target profile is private and viewer is not following', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce({
        id: 'priv-user',
        user: { settings: { privacyLevel: Visibility.PRIVATE } },
      });
      await expect(
        service.findByUser('priv', { page: 1, limit: 10 }, undefined),
      ).rejects.toThrow('This account is private');

      mockPrismaService.profile.findFirst.mockResolvedValueOnce({
        id: 'priv-user',
        user: { settings: { privacyLevel: Visibility.PRIVATE } },
      });
      mockPrismaService.follow.findUnique.mockResolvedValueOnce({
        status: 'PENDING',
      });
      await expect(
        service.findByUser('priv', { page: 1, limit: 10 }, undefined, 'viewer'),
      ).rejects.toThrow('This account is private');
    });

    it('allows author or accepted follower to view posts with optional type filter', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce({
        id: 'user-1',
        user: { settings: { privacyLevel: Visibility.PUBLIC } },
      });
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        { id: 'post-1', profileId: 'user-1', likes: [{ id: 'l1' }] },
      ]);
      mockPrismaService.post.count.mockResolvedValueOnce(1);

      const result = await service.findByUser(
        'username',
        { page: 2, limit: 10, cursor: 'c-user' },
        'FRAME',
        'user-1',
      );
      expect(result.data).toHaveLength(1);
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            profileId: 'user-1',
            type: 'FRAME',
          }),
          skip: 1,
          cursor: { id: 'c-user' },
        }),
      );
    });

    it('constructs follower filter when viewer is logged in and not author', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce({
        id: 'user-author',
        user: { settings: { privacyLevel: Visibility.PUBLIC } },
      });
      mockPrismaService.post.findMany.mockResolvedValueOnce([]);
      mockPrismaService.post.count.mockResolvedValueOnce(0);

      const result = await service.findByUser(
        'username',
        { page: 1, limit: 10 },
        undefined,
        'viewer-2',
      );
      expect(result.data).toHaveLength(0);
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            profileId: 'user-author',
            moderationStatus: { in: ['VISIBLE', 'FLAGGED'] },
          }),
        }),
      );
    });

    it('constructs public filter when viewer is not logged in', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce({
        id: 'user-public',
        user: { settings: { privacyLevel: Visibility.PUBLIC } },
      });
      mockPrismaService.post.findMany.mockResolvedValueOnce([]);
      mockPrismaService.post.count.mockResolvedValueOnce(0);

      const result = await service.findByUser('username', {
        page: 1,
        limit: 10,
      });
      expect(result.data).toHaveLength(0);
      expect(result.meta.nextCursor).toBeUndefined();
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            profileId: 'user-public',
            visibility: Visibility.PUBLIC,
          }),
        }),
      );
    });
  });

  describe('getTaggedPosts', () => {
    it('throws NotFoundException when profile is not found', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.getTaggedPosts('unknown', { page: 1, limit: 10 }),
      ).rejects.toThrow('User not found');
    });

    it('returns empty list for tagged posts when no posts match', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce({
        id: 'prof-tagged',
      });
      mockPrismaService.post.findMany.mockResolvedValueOnce([]);
      mockPrismaService.post.count.mockResolvedValueOnce(0);

      const result = await service.getTaggedPosts('alice', {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(0);
      expect(result.meta.nextCursor).toBeUndefined();
    });

    it('returns paginated tagged posts with cursor and injects isLiked', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValueOnce({
        id: 'prof-tagged',
      });
      mockPrismaService.post.findMany.mockResolvedValueOnce([
        {
          id: 'post-tag-1',
          tags: [{ profileId: 'prof-tagged' }],
          likes: [],
        },
      ]);
      mockPrismaService.post.count.mockResolvedValueOnce(1);

      const result = await service.getTaggedPosts('alice', {
        page: 2,
        limit: 10,
        cursor: 'c-tag',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].isLiked).toBe(false);
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 1,
          cursor: { id: 'c-tag' },
        }),
      );
    });
  });

  describe('update', () => {
    it('should update post caption and visibility', async () => {
      mockPrismaService.post.update.mockResolvedValue({
        id: 'post-1',
        caption: 'new caption',
        visibility: Visibility.PUBLIC,
      });

      const result = await service.update('post-1', {
        caption: 'new caption',
        visibility: Visibility.PUBLIC,
      });
      expect(result.id).toBe('post-1');
      expect(mockPrismaService.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: {
          caption: 'new caption',
          visibility: Visibility.PUBLIC,
        },
        include: expect.any(Object),
      });
    });
  });

  describe('remove', () => {
    it('should delete post and trigger media cleanup', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        profileId: 'me',
        media: [{ url: 'https://cdn/img.jpg' }],
      });

      mockPrismaService.post.delete.mockResolvedValue({ id: 'post-1' });

      await service.remove('post-1');
      expect(mockPrismaService.post.delete).toHaveBeenCalledWith({
        where: { id: 'post-1' },
      });
      expect(mockPostMediaCleanupService.cleanupMedia).toHaveBeenCalledWith([
        { url: 'https://cdn/img.jpg' },
      ]);
    });

    it('throws when the post is missing', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(null);
      mockPrismaService.post.delete.mockClear();
      await expect(service.remove('missing')).rejects.toThrow('Post not found');
      expect(mockPrismaService.post.delete).not.toHaveBeenCalled();
      expect(mockPostMediaCleanupService.cleanupMedia).not.toHaveBeenCalled();
    });
  });

  describe('adminRemove', () => {
    it('throws NotFoundException when post does not exist', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce(null);
      await expect(service.adminRemove('not-found')).rejects.toThrow(
        'Post not found',
      );
    });

    it('deletes post and triggers media cleanup on success', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-admin',
        media: [{ url: 'http://cdn/1.jpg' }],
      });
      mockPrismaService.post.delete.mockResolvedValueOnce({ id: 'p-admin' });

      await service.adminRemove('p-admin');
      expect(mockPrismaService.post.delete).toHaveBeenCalledWith({
        where: { id: 'p-admin' },
      });
      expect(mockPostMediaCleanupService.cleanupMedia).toHaveBeenCalledWith([
        { url: 'http://cdn/1.jpg' },
      ]);
    });
  });
});
