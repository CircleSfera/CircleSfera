import { ForbiddenException } from '@nestjs/common';
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIService } from '../ai/ai.service.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreatePostDto } from './dto/create-post.dto.js';
import { PostsService } from './posts.service.js';

describe('PostsService', () => {
  let service: PostsService;

  const mockPrismaService = {
    $transaction: vi.fn(),
    post: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    profile: {
      findUnique: vi.fn(),
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
      upsert: vi.fn(),
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

  const mockNotificationsService = {
    create: vi.fn(),
  };

  const mockAIService = {
    generateEmbedding: vi.fn(() => [0.1, 0.2, 0.3]),
  };

  const mockQueue = {
    add: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: AIService, useValue: mockAIService },
        { provide: 'BullQueue_ai-processing', useValue: mockQueue },
        { provide: AnalyticsService, useValue: { trackEvent: vi.fn() } },
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
      await service.create(userId, dto);

      expect(mockTx.post.create).toHaveBeenCalled();
      expect(mockTx.hashtag.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tag: 'world' },
        }),
      );

      expect(mockNotificationsService.create).toHaveBeenCalledWith(
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
    it('should throw ForbiddenException if user is not author', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        userId: 'other-user',
      });
      await expect(
        service.update('post-1', 'me', { caption: 'new' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update post if user is author', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        userId: 'me',
      });

      mockPrismaService.post.update.mockResolvedValue({ id: 'post-1' });

      await service.update('post-1', 'me', { caption: 'new' });
      expect(mockPrismaService.post.update).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should throw ForbiddenException if user is not author', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        userId: 'other-user',
      });
      await expect(service.remove('post-1', 'me')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should delete post if user is author', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        userId: 'me',
      });

      mockPrismaService.post.delete.mockResolvedValue({ id: 'post-1' });

      await service.remove('post-1', 'me');
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
      mockPrismaService.profile.findUnique.mockResolvedValue({
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
