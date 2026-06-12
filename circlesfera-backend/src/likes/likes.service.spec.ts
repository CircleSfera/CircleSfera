import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LikesService } from './likes.service.js';

describe('LikesService', () => {
  let service: LikesService;

  const mockPrismaService = {
    post: {
      findUnique: vi.fn(),
    },
    like: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
  };

  const mockNotificationsService = {
    create: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LikesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<LikesService>(LikesService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('toggle', () => {
    const postId = 'post-1';
    const userId = 'user-1';

    it('should like a post and notify owner if not self', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: postId,
        userId: 'owner-1',
      });
      mockPrismaService.like.findUnique.mockResolvedValue(null);
      mockPrismaService.like.create.mockResolvedValue({ id: 'like-1' });

      const result = await service.toggle(postId, userId);

      expect(result).toEqual({ liked: true });
      expect(mockPrismaService.like.create).toHaveBeenCalledWith({
        data: { postId, userId },
      });
      expect(mockNotificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'owner-1',
          senderId: userId,
          type: 'LIKE',
        }),
      );
    });

    it('should like a post without notification if self', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: postId,
        userId: userId,
      });
      mockPrismaService.like.findUnique.mockResolvedValue(null);

      const result = await service.toggle(postId, userId);

      expect(result).toEqual({ liked: true });
      expect(mockNotificationsService.create).not.toHaveBeenCalled();
    });

    it('should unlike a post if already liked', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: postId,
        userId: 'owner-1',
      });
      mockPrismaService.like.findUnique.mockResolvedValue({ id: 'like-1' });

      const result = await service.toggle(postId, userId);

      expect(result).toEqual({ liked: false });
      expect(mockPrismaService.like.delete).toHaveBeenCalledWith({
        where: { id: 'like-1' },
      });
      expect(mockNotificationsService.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if post not found', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(null);

      await expect(service.toggle(postId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('checkLike', () => {
    const postId = 'post-1';
    const userId = 'user-1';

    it('should return true if like exists', async () => {
      mockPrismaService.like.findUnique.mockResolvedValue({ id: 'like-1' });

      const result = await service.checkLike(postId, userId);
      expect(result).toEqual({ liked: true });
    });

    it('should return false if like does not exist', async () => {
      mockPrismaService.like.findUnique.mockResolvedValue(null);

      const result = await service.checkLike(postId, userId);
      expect(result).toEqual({ liked: false });
    });
  });

  describe('getLikesByPost', () => {
    it('should return users who liked the post', async () => {
      mockPrismaService.like.findMany.mockResolvedValue([
        { user: { id: 'user-1', profile: { firstName: 'John' } } },
      ]);

      const result = await service.getLikesByPost('post-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('user-1');
    });
  });
});
