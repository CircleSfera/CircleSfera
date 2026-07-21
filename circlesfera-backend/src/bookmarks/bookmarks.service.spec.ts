import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { BookmarksService } from './bookmarks.service.js';

describe('BookmarksService', () => {
  let service: BookmarksService;

  const mockPrismaService = {
    post: {
      findUnique: vi.fn(),
    },
    bookmark: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    collection: {
      findUnique: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookmarksService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<BookmarksService>(BookmarksService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('toggle', () => {
    it('should throw NotFoundException if post does not exist', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(null);

      await expect(service.toggle('user-1', 'invalid-post')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should create bookmark if not already bookmarked', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({ id: 'post-1' });
      mockPrismaService.bookmark.findUnique.mockResolvedValue(null);
      mockPrismaService.bookmark.create.mockResolvedValue({
        id: 'b-1',
        userId: 'user-1',
        postId: 'post-1',
      });

      const result = await service.toggle('user-1', 'post-1');
      expect(mockPrismaService.bookmark.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', postId: 'post-1' },
      });
      expect(result).toEqual({ bookmarked: true });
    });

    it('should delete bookmark if already bookmarked', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({ id: 'post-1' });
      mockPrismaService.bookmark.findUnique.mockResolvedValue({
        id: 'b-1',
        userId: 'user-1',
        postId: 'post-1',
      });

      const result = await service.toggle('user-1', 'post-1');
      expect(mockPrismaService.bookmark.delete).toHaveBeenCalledWith({
        where: { userId_postId: { userId: 'user-1', postId: 'post-1' } },
      });
      expect(result).toEqual({ bookmarked: false });
    });
  });

  describe('check', () => {
    it('should return bookmarked true if record exists', async () => {
      mockPrismaService.bookmark.findUnique.mockResolvedValue({ id: 'b-1' });

      const result = await service.check('user-1', 'post-1');
      expect(result).toEqual({ bookmarked: true });
    });

    it('should return bookmarked false if record does not exist', async () => {
      mockPrismaService.bookmark.findUnique.mockResolvedValue(null);

      const result = await service.check('user-1', 'post-1');
      expect(result).toEqual({ bookmarked: false });
    });
  });

  describe('getByCollection', () => {
    it('should throw NotFoundException if collection does not exist', async () => {
      mockPrismaService.collection.findUnique.mockResolvedValue(null);

      await expect(
        service.getByCollection('user-1', 'col-invalid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user does not own collection', async () => {
      mockPrismaService.collection.findUnique.mockResolvedValue({
        id: 'col-1',
        userId: 'other-user',
      });

      await expect(
        service.getByCollection('user-1', 'col-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
