/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIService } from '../ai/ai.service.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SystemSettingsService } from '../system-settings/system-settings.service.js';
import type { CreatePostDto } from './dto/create-post.dto.js';
import { PostsService } from './posts.service.js';
import { PostDistributionService } from './services/post-distribution.service.js';
import { PostMediaCleanupService } from './services/post-media-cleanup.service.js';
import { PostPaywallService } from './services/post-paywall.service.js';

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

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AIService, useValue: mockAIService },
        {
          provide: AnalyticsService,
          useValue: { trackPostView: vi.fn().mockResolvedValue(undefined) },
        },
        {
          provide: SystemSettingsService,
          useValue: { isEnabled: vi.fn(async () => true) },
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
    it('should extract hashtags and mentions and run transaction', async () => {
      const profileId = 'user-1';
      const dto = {
        caption: 'Hello #world @user2',
        type: 'POST' as const,
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

      mockPrismaService.post.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'post-1',
        caption: 'Hello #world @user2',
        media: [],
        author: { profile: { username: 'user1' } },
        _count: { likes: 0, comments: 0 },
      });

      const _result = await service.create(profileId, dto);

      expect(mockTx.post.create).toHaveBeenCalled();
      expect(mockTx.hashtag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tag: 'world' },
        }),
      );
      expect(mockTx.postHashtag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { postId: 'post-1', hashtagId: 'tag-1' },
        }),
      );

      expect(
        mockPostDistributionService.dispatchPostPublished,
      ).toHaveBeenCalledWith(expect.objectContaining({ id: 'post-1' }), {
        caption: 'Hello #world @user2',
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

    it('rejects a Frame that is not video', async () => {
      await expect(
        service.create('user-1', {
          type: 'FRAME',
          media: [{ url: 'url1', type: 'image' }],
        }),
      ).rejects.toThrow('FRAME_VIDEO_ONLY');
    });
  });

  describe('update', () => {
    it('should update post if user is author', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        profileId: 'me',
      });

      mockPrismaService.post.update.mockResolvedValue({ id: 'post-1' });

      await service.update('post-1', { caption: 'new' });
      expect(mockPrismaService.post.update).toHaveBeenCalled();
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

  describe('findAll', () => {
    it('should return paginated posts and invoke paywall service', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([
        { id: '1', type: 'POST', profile: { profile: {} }, likes: [] },
      ]);
      mockPrismaService.post.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(mockPostPaywallService.applyPaywall).toHaveBeenCalled();
    });
  });

  describe('findByUser', () => {
    it('should return posts for a specific user', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({
        id: 'user-1',
        user: { settings: { privacyLevel: 'PUBLIC' } },
      });
      mockPrismaService.post.findMany.mockResolvedValue([{ id: 'post-1' }]);
      mockPrismaService.post.count.mockResolvedValue(1);

      const result = await service.findByUser('username', {
        page: 1,
        limit: 10,
      });
      expect(result.data).toHaveLength(1);
      expect(mockPrismaService.post.findMany).toHaveBeenCalled();
      expect(mockPostPaywallService.applyPaywall).toHaveBeenCalled();
    });
  });
});
