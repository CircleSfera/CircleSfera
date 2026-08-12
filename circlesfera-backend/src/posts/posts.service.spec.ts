/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { getQueueToken } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIService } from '../ai/ai.service.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SystemSettingsService } from '../system-settings/system-settings.service.js';
import type { CreatePostDto } from './dto/create-post.dto.js';
import { PostsService } from './posts.service.js';

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
    promotion: {
      findMany: vi.fn(),
    },
    creatorSubscription: {
      findMany: vi.fn(),
    },
    unlockedPost: {
      findMany: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
    },
  };

  const mockEventEmitter = {
    emit: vi.fn(),
  };

  const mockAIService = {
    generateEmbedding: vi.fn(() => [0.1, 0.2, 0.3]),
    moderateContent: vi.fn().mockResolvedValue({
      isSafe: true,
      categories: {},
      reason: 'Safe content',
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: AIService, useValue: mockAIService },
        { provide: AnalyticsService, useValue: { trackEvent: vi.fn() } },
        {
          provide: getQueueToken('ai-processing'),
          useValue: { add: vi.fn() },
        },
        {
          provide: getQueueToken('posts-processing'),
          useValue: { add: vi.fn() },
        },
        {
          provide: getQueueToken('feed-fanout'),
          useValue: { add: vi.fn() },
        },
        {
          provide: SystemSettingsService,
          useValue: { isEnabled: vi.fn(async () => true) },
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
      const userId = 'user-1';
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
        postEmbedding: { create: vi.fn() },
        hashtag: { upsert: vi.fn().mockResolvedValue({ id: 'tag-1' }) },
        postHashtag: { create: vi.fn() },
      };

      mockPrismaService.$transaction.mockImplementation(
        async (
          callback: (tx: Partial<PrismaService>) => Promise<unknown>,
        ): Promise<unknown> =>
          callback(mockTx as unknown as Partial<PrismaService>),
      );

      mockPrismaService.profile.findMany.mockResolvedValue([
        { userId: 'user-2' },
      ]);
      mockPrismaService.post.findUniqueOrThrow.mockResolvedValueOnce({
        id: 'post-1',
        caption: 'Hello #world @user2',
        media: [],
        author: { profile: { username: 'user1' } },
        _count: { likes: 0, comments: 0 },
      });

      const _result = await service.create(userId, dto);

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

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          recipientId: 'user-2',
          type: 'MENTION',
        }),
      );
    });

    it('should create post with multiple media items', async () => {
      const userId = 'user-1';
      const dto: CreatePostDto = {
        caption: 'Post with media',
        media: [
          { url: 'url1', type: 'image' },
          { url: 'url2', type: 'video' },
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

      await service.create(userId, dto);

      expect(mockTx.postMedia.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ url: 'url1', type: 'image', order: 0 }),
          expect.objectContaining({ url: 'url2', type: 'video', order: 1 }),
        ]),
      });
    });
  });

  describe('update', () => {
    it('should update post if user is author', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        userId: 'me',
      });

      mockPrismaService.post.update.mockResolvedValue({ id: 'post-1' });

      await service.update('post-1', { caption: 'new' });
      expect(mockPrismaService.post.update).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete post if user is author', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        userId: 'me',
      });

      mockPrismaService.post.delete.mockResolvedValue({ id: 'post-1' });

      await service.remove('post-1');
      expect(mockPrismaService.post.delete).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated posts', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([
        { id: '1', type: 'POST', user: { profile: {} }, likes: [] },
      ]);
      mockPrismaService.post.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('findByUser', () => {
    it('should return posts for a specific user', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({
        userId: 'user-1',
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
    });
  });
});
