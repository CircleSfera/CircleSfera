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
        profileId: 'user-1',
        postId: 'post-1',
      });

      const result = await service.toggle('user-1', 'post-1');
      expect(mockPrismaService.bookmark.create).toHaveBeenCalledWith({
        data: { profileId: 'user-1', postId: 'post-1' },
      });
      expect(result).toEqual({ bookmarked: true });
    });

    it('should create bookmark with collectionId if provided and owned', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({ id: 'post-1' });
      mockPrismaService.collection.findUnique.mockResolvedValue({
        id: 'col-1',
        profileId: 'user-1',
      });
      mockPrismaService.bookmark.findUnique.mockResolvedValue(null);
      mockPrismaService.bookmark.create.mockResolvedValue({
        id: 'b-1',
        profileId: 'user-1',
        postId: 'post-1',
        collectionId: 'col-1',
      });

      const result = await service.toggle('user-1', 'post-1', 'col-1');
      expect(mockPrismaService.bookmark.create).toHaveBeenCalledWith({
        data: { profileId: 'user-1', postId: 'post-1', collectionId: 'col-1' },
      });
      expect(result).toEqual({ bookmarked: true });
    });

    it('should throw ForbiddenException when collectionId belongs to another profile', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({ id: 'post-1' });
      mockPrismaService.collection.findUnique.mockResolvedValue({
        id: 'col-1',
        profileId: 'other-user',
      });

      await expect(service.toggle('user-1', 'post-1', 'col-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrismaService.bookmark.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when collectionId does not exist', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({ id: 'post-1' });
      mockPrismaService.collection.findUnique.mockResolvedValue(null);

      await expect(
        service.toggle('user-1', 'post-1', 'col-missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update collection if already bookmarked but different collectionId requested', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({ id: 'post-1' });
      mockPrismaService.collection.findUnique.mockResolvedValue({
        id: 'col-new',
        profileId: 'user-1',
      });
      mockPrismaService.bookmark.findUnique.mockResolvedValue({
        id: 'b-1',
        profileId: 'user-1',
        postId: 'post-1',
        collectionId: 'col-old',
      });
      mockPrismaService.bookmark.update.mockResolvedValue({
        id: 'b-1',
        collectionId: 'col-new',
      });

      const result = await service.toggle('user-1', 'post-1', 'col-new');
      expect(mockPrismaService.bookmark.update).toHaveBeenCalledWith({
        where: { id: 'b-1' },
        data: { collectionId: 'col-new' },
      });
      expect(result).toEqual({ id: 'b-1', collectionId: 'col-new' });
    });

    it('should delete bookmark if already bookmarked', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({ id: 'post-1' });
      mockPrismaService.bookmark.findUnique.mockResolvedValue({
        id: 'b-1',
        profileId: 'user-1',
        postId: 'post-1',
      });

      const result = await service.toggle('user-1', 'post-1');
      expect(mockPrismaService.bookmark.delete).toHaveBeenCalledWith({
        where: { profileId_postId: { profileId: 'user-1', postId: 'post-1' } },
      });
      expect(result).toEqual({ bookmarked: false });
    });
  });

  describe('updateCollection', () => {
    it('should create a new bookmark in collection if bookmark does not exist', async () => {
      mockPrismaService.collection.findUnique.mockResolvedValue({
        id: 'col-1',
        profileId: 'user-1',
      });
      mockPrismaService.bookmark.findUnique.mockResolvedValue(null);
      mockPrismaService.bookmark.create.mockResolvedValue({
        id: 'b-new',
        profileId: 'user-1',
        postId: 'post-1',
        collectionId: 'col-1',
      });

      const res = await service.updateCollection('user-1', 'post-1', 'col-1');
      expect(res.id).toBe('b-new');
      expect(mockPrismaService.bookmark.create).toHaveBeenCalledWith({
        data: { profileId: 'user-1', postId: 'post-1', collectionId: 'col-1' },
      });
    });

    it('should update existing bookmark collectionId if bookmark exists', async () => {
      mockPrismaService.collection.findUnique.mockResolvedValue({
        id: 'col-2',
        profileId: 'user-1',
      });
      mockPrismaService.bookmark.findUnique.mockResolvedValue({
        id: 'b-existing',
      });
      mockPrismaService.bookmark.update.mockResolvedValue({
        id: 'b-existing',
        collectionId: 'col-2',
      });

      const res = await service.updateCollection('user-1', 'post-1', 'col-2');
      expect(res.collectionId).toBe('col-2');
      expect(mockPrismaService.bookmark.update).toHaveBeenCalledWith({
        where: { id: 'b-existing' },
        data: { collectionId: 'col-2' },
      });
    });

    it('should throw ForbiddenException when target collection belongs to another profile', async () => {
      mockPrismaService.collection.findUnique.mockResolvedValue({
        id: 'col-2',
        profileId: 'other-user',
      });

      await expect(
        service.updateCollection('user-1', 'post-1', 'col-2'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.bookmark.findUnique).not.toHaveBeenCalled();
    });

    it('should not require collection ownership when clearing the collection (null)', async () => {
      mockPrismaService.bookmark.findUnique.mockResolvedValue({
        id: 'b-existing',
        collectionId: 'col-old',
      });
      mockPrismaService.bookmark.update.mockResolvedValue({
        id: 'b-existing',
        collectionId: null,
      });

      const res = await service.updateCollection('user-1', 'post-1', null);
      expect(res.collectionId).toBeNull();
      expect(mockPrismaService.collection.findUnique).not.toHaveBeenCalled();
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

  describe('getBookmarks', () => {
    it('should retrieve bookmarks with default pagination and without collectionId', async () => {
      const mockPost = { id: 'post-1', caption: 'Test post' };
      mockPrismaService.bookmark.findMany.mockResolvedValue([
        { id: 'b-1', post: mockPost },
      ]);
      mockPrismaService.bookmark.count.mockResolvedValue(1);

      const res = await service.getBookmarks('user-1');
      expect(res.data).toEqual([mockPost]);
      expect(res.meta.total).toBe(1);
      expect(res.meta.page).toBe(1);
      expect(res.meta.collectionName).toBeUndefined();
    });

    it('should retrieve bookmarks with collectionId and lookup collection name', async () => {
      mockPrismaService.bookmark.findMany.mockResolvedValue([]);
      mockPrismaService.bookmark.count.mockResolvedValue(0);
      mockPrismaService.collection.findUnique.mockResolvedValue({
        name: 'Design Ideas',
        profileId: 'user-1',
      });

      const res = await service.getBookmarks('user-1', 2, 5, 'col-1');
      expect(res.meta.collectionName).toBe('Design Ideas');
      expect(res.meta.page).toBe(2);
      expect(res.meta.limit).toBe(5);

      // Also cover missing collection
      mockPrismaService.collection.findUnique.mockResolvedValue(null);
      const resMissingCol = await service.getBookmarks(
        'user-1',
        1,
        10,
        'col-none',
      );
      expect(resMissingCol.meta.collectionName).toBeUndefined();
    });

    it('should omit collectionName instead of leaking it when the collection belongs to another profile', async () => {
      mockPrismaService.bookmark.findMany.mockResolvedValue([]);
      mockPrismaService.bookmark.count.mockResolvedValue(0);
      mockPrismaService.collection.findUnique.mockResolvedValue({
        name: 'Someone Else Private Board',
        profileId: 'other-user',
      });

      const res = await service.getBookmarks('user-1', 1, 10, 'col-foreign');
      expect(res.meta.collectionName).toBeUndefined();
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
        profileId: 'other-user',
      });

      await expect(service.getByCollection('user-1', 'col-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return paginated posts for valid collection owned by user', async () => {
      mockPrismaService.collection.findUnique.mockResolvedValue({
        id: 'col-1',
        name: 'Favorites',
        profileId: 'user-1',
      });
      const mockPost = { id: 'p-fav' };
      mockPrismaService.bookmark.findMany.mockResolvedValue([
        { id: 'b-fav', post: mockPost },
      ]);
      mockPrismaService.bookmark.count.mockResolvedValue(1);

      const res = await service.getByCollection('user-1', 'col-1');
      expect(res.data).toEqual([mockPost]);
      expect(res.total).toBe(1);
      expect(res.collectionName).toBe('Favorites');
    });
  });
});
