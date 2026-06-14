import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CommentsService } from './comments.service.js';

describe('CommentsService', () => {
  let service: CommentsService;

  const mockPrismaService = {
    post: {
      findUnique: vi.fn(),
    },
    comment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
    },
    profile: {
      findMany: vi.fn(),
    },
  };

  const mockNotificationsService = {
    create: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: 'BullQueue_ai-processing', useValue: { add: vi.fn() } },
        {
          provide: 'BullQueue_analytics-processing',
          useValue: { add: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const postId = 'post-1';
    const userId = 'user-1';
    const dto = { content: 'Nice post! @user2' };

    it('should create a comment and notify post owner', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: postId,
        userId: 'owner-1',
      });
      mockPrismaService.comment.create.mockResolvedValue({
        id: 'comment-1',
        content: dto.content,
      });
      mockPrismaService.profile.findMany.mockResolvedValue([
        { userId: 'user-2' },
      ]);

      const result = await service.create(postId, userId, dto);

      expect(result).toBeDefined();
      expect(mockPrismaService.comment.create).toHaveBeenCalled();
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'owner-1',
          type: 'COMMENT',
        }),
      );
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'user-2',
          type: 'MENTION',
        }),
      );
    });

    it('should throw NotFoundException if post not found', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(null);

      await expect(service.create(postId, userId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should notify parent comment owner if it is a reply', async () => {
      const replyDto = { content: 'Reply content', parentId: 'parent-1' };
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: postId,
        userId: userId,
      }); // Same user as post owner to avoid notification duplicate in test check
      mockPrismaService.comment.findUnique.mockResolvedValue({
        id: 'parent-1',
        userId: 'parent-owner-1',
      });
      mockPrismaService.comment.create.mockResolvedValue({ id: 'comment-1' });

      await service.create(postId, userId, replyDto);

      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'parent-owner-1',
          content: 'replied to your comment',
        }),
      );
    });
  });

  describe('findByPost', () => {
    it('should return paginated comments', async () => {
      mockPrismaService.comment.findMany.mockResolvedValue([
        { id: '1', replies: [] },
      ]);
      mockPrismaService.comment.count.mockResolvedValue(1);

      const result = await service.findByPost('post-1', { page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('remove', () => {
    it('should delete comment if owner', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue({
        id: '1',
        userId: 'user-1',
      });

      await service.remove('1', 'user-1');

      expect(mockPrismaService.comment.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('should throw ForbiddenException if not owner', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue({
        id: '1',
        userId: 'user-2',
      });

      await expect(service.remove('1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
