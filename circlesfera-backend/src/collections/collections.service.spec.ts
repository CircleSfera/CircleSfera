import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CollectionsService } from './collections.service.js';

describe('CollectionsService', () => {
  let service: CollectionsService;

  const mockPrismaService = {
    collection: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollectionsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CollectionsService>(CollectionsService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new collection', async () => {
      mockPrismaService.collection.create.mockResolvedValue({
        id: 'col-1',
        profileId: 'profile-1',
        name: 'Design Inspiration',
        description: null,
      });

      const result = await service.create('profile-1', {
        name: 'Design Inspiration',
      });
      expect(mockPrismaService.collection.create).toHaveBeenCalledWith({
        data: {
          profileId: 'profile-1',
          name: 'Design Inspiration',
          description: null,
        },
      });
      expect(result).toHaveProperty('id', 'col-1');
    });

    it('should persist an optional description', async () => {
      mockPrismaService.collection.create.mockResolvedValue({
        id: 'col-2',
        name: 'Travel',
        description: 'Summer trips',
      });

      await service.create('profile-1', {
        name: 'Travel',
        description: '  Summer trips  ',
      });
      expect(mockPrismaService.collection.create).toHaveBeenCalledWith({
        data: {
          profileId: 'profile-1',
          name: 'Travel',
          description: 'Summer trips',
        },
      });
    });
  });

  describe('update', () => {
    it('should update name and description when owned', async () => {
      mockPrismaService.collection.findUnique.mockResolvedValue({
        id: 'col-1',
        profileId: 'profile-1',
      });
      mockPrismaService.collection.update.mockResolvedValue({
        id: 'col-1',
        name: 'Later',
        description: 'Notes',
      });

      await service.update('profile-1', 'col-1', {
        name: 'Later',
        description: 'Notes',
      });
      expect(mockPrismaService.collection.update).toHaveBeenCalledWith({
        where: { id: 'col-1' },
        data: { name: 'Later', description: 'Notes' },
      });
    });
    it('should update name only when description is undefined', async () => {
      mockPrismaService.collection.findUnique.mockResolvedValue({
        id: 'col-1',
        profileId: 'profile-1',
      });
      mockPrismaService.collection.update.mockResolvedValue({
        id: 'col-1',
        name: 'Only Name',
      });

      await service.update('profile-1', 'col-1', {
        name: 'Only Name',
      });
      expect(mockPrismaService.collection.update).toHaveBeenCalledWith({
        where: { id: 'col-1' },
        data: { name: 'Only Name' },
      });
    });

    it('should set description to null when blank string is passed in update', async () => {
      mockPrismaService.collection.findUnique.mockResolvedValue({
        id: 'col-1',
        profileId: 'profile-1',
      });
      mockPrismaService.collection.update.mockResolvedValue({
        id: 'col-1',
        name: 'Name',
        description: null,
      });

      await service.update('profile-1', 'col-1', {
        name: 'Name',
        description: '   ',
      });
      expect(mockPrismaService.collection.update).toHaveBeenCalledWith({
        where: { id: 'col-1' },
        data: { name: 'Name', description: null },
      });
    });

    it('should throw NotFound when updating non-existent collection', async () => {
      mockPrismaService.collection.findUnique.mockResolvedValue(null);
      await expect(
        service.update('profile-1', 'invalid-id', { name: 'New' }),
      ).rejects.toThrow(AppException);
    });

    it('should throw Forbidden when updating collection owned by someone else', async () => {
      mockPrismaService.collection.findUnique.mockResolvedValue({
        id: 'col-1',
        profileId: 'other-profile',
      });
      await expect(
        service.update('profile-1', 'col-1', { name: 'New' }),
      ).rejects.toThrow(AppException);
    });
  });

  describe('findAll', () => {
    it('should return user collections with auto-derived coverUrl', async () => {
      mockPrismaService.collection.findMany.mockResolvedValue([
        {
          id: 'col-1',
          name: 'Architecture',
          coverUrl: null,
          bookmarks: [
            {
              post: {
                media: [{ url: 'https://cdn.example.com/arch.jpg' }],
              },
            },
          ],
          _count: { bookmarks: 1 },
        },
        {
          id: 'col-2',
          name: 'Existing Cover',
          coverUrl: 'https://cdn.example.com/cover.jpg',
          bookmarks: [],
          _count: { bookmarks: 0 },
        },
        {
          id: 'col-3',
          name: 'No Media in Post',
          coverUrl: null,
          bookmarks: [
            {
              post: { media: [] },
            },
          ],
          _count: { bookmarks: 1 },
        },
      ]);

      const collections = await service.findAll('profile-1');
      expect(collections[0].coverUrl).toBe('https://cdn.example.com/arch.jpg');
      expect(collections[1].coverUrl).toBe('https://cdn.example.com/cover.jpg');
      expect(collections[2].coverUrl).toBeNull();
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException if collection does not exist', async () => {
      mockPrismaService.collection.findUnique.mockResolvedValue(null);

      await expect(service.findOne('profile-1', 'invalid-id')).rejects.toThrow(
        AppException,
      );
    });

    it('should throw ForbiddenException if user does not own collection', async () => {
      mockPrismaService.collection.findUnique.mockResolvedValue({
        id: 'col-1',
        profileId: 'other-profile',
      });

      await expect(service.findOne('profile-1', 'col-1')).rejects.toThrow(
        AppException,
      );
    });

    it('should return collection if owned by user', async () => {
      mockPrismaService.collection.findUnique.mockResolvedValue({
        id: 'col-1',
        profileId: 'profile-1',
        bookmarks: [],
      });

      const result = await service.findOne('profile-1', 'col-1');
      expect(result).toHaveProperty('id', 'col-1');
    });
  });

  describe('delete', () => {
    it('should throw NotFound when deleting non-existent collection', async () => {
      mockPrismaService.collection.findUnique.mockResolvedValue(null);
      await expect(
        service.delete('profile-1', 'col-non-existent'),
      ).rejects.toThrow(AppException);
    });

    it('should throw Forbidden when deleting collection of another user', async () => {
      mockPrismaService.collection.findUnique.mockResolvedValue({
        id: 'col-1',
        profileId: 'other-profile',
      });
      await expect(service.delete('profile-1', 'col-1')).rejects.toThrow(
        AppException,
      );
    });

    it('should delete collection if user owns it', async () => {
      mockPrismaService.collection.findUnique.mockResolvedValue({
        id: 'col-1',
        profileId: 'profile-1',
      });
      mockPrismaService.collection.delete.mockResolvedValue({ id: 'col-1' });

      const result = await service.delete('profile-1', 'col-1');
      expect(mockPrismaService.collection.delete).toHaveBeenCalledWith({
        where: { id: 'col-1' },
      });
      expect(result).toHaveProperty('id', 'col-1');
    });
  });
});
