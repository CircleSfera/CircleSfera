import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
        userId: 'user-1',
        name: 'Design Inspiration',
      });

      const result = await service.create('user-1', 'Design Inspiration');
      expect(mockPrismaService.collection.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', name: 'Design Inspiration' },
      });
      expect(result).toHaveProperty('id', 'col-1');
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
      ]);

      const collections = await service.findAll('user-1');
      expect(collections[0].coverUrl).toBe('https://cdn.example.com/arch.jpg');
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException if collection does not exist', async () => {
      mockPrismaService.collection.findUnique.mockResolvedValue(null);

      await expect(service.findOne('user-1', 'invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user does not own collection', async () => {
      mockPrismaService.collection.findUnique.mockResolvedValue({
        id: 'col-1',
        userId: 'other-user',
      });

      await expect(service.findOne('user-1', 'col-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('delete', () => {
    it('should delete collection if user owns it', async () => {
      mockPrismaService.collection.findUnique.mockResolvedValue({
        id: 'col-1',
        userId: 'user-1',
      });
      mockPrismaService.collection.delete.mockResolvedValue({ id: 'col-1' });

      const result = await service.delete('user-1', 'col-1');
      expect(mockPrismaService.collection.delete).toHaveBeenCalledWith({
        where: { id: 'col-1' },
      });
      expect(result).toHaveProperty('id', 'col-1');
    });
  });
});
