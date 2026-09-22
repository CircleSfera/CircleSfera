import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { HighlightsService } from './highlights.service.js';

describe('HighlightsService', () => {
  let service: HighlightsService;

  const mockPrismaService = {
    highlight: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HighlightsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<HighlightsService>(HighlightsService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a story highlight', async () => {
      const dto = {
        title: 'Summer 2026',
        coverUrl: 'https://cdn.example.com/cover.jpg',
        storyIds: ['story-1', 'story-2'],
      };

      mockPrismaService.highlight.create.mockResolvedValue({
        id: 'hl-1',
        userId: 'user-1',
        ...dto,
      });

      const result = await service.create('user-1', dto);
      expect(mockPrismaService.highlight.create).toHaveBeenCalled();
      expect(result).toHaveProperty('id', 'hl-1');
    });
  });

  describe('findAll', () => {
    it('should return user highlights', async () => {
      mockPrismaService.highlight.findMany.mockResolvedValue([
        { id: 'hl-1', title: 'Summer 2026' },
      ]);

      const highlights = await service.findAll('user-1');
      expect(highlights).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException if highlight does not exist', async () => {
      mockPrismaService.highlight.findUnique.mockResolvedValue(null);

      await expect(service.findOne('invalid-id')).rejects.toThrow(AppException);
    });

    it('should return highlight if exists', async () => {
      mockPrismaService.highlight.findUnique.mockResolvedValue({
        id: 'hl-1',
        title: 'Travel',
      });

      const result = await service.findOne('hl-1');
      expect(result).toHaveProperty('id', 'hl-1');
    });
  });

  describe('update', () => {
    it('should throw NotFoundException if highlight not found or permission denied', async () => {
      mockPrismaService.highlight.findFirst.mockResolvedValue(null);

      await expect(
        service.update('hl-none', 'user-1', { title: 'New' }),
      ).rejects.toThrow(AppException);
    });

    it('should update highlight with new stories when storyIds provided', async () => {
      mockPrismaService.highlight.findFirst.mockResolvedValue({
        id: 'hl-1',
        profileId: 'user-1',
      });
      mockPrismaService.highlight.update.mockResolvedValue({
        id: 'hl-1',
        title: 'Updated Highlight',
        coverUrl: 'https://cdn.example.com/new-cover.jpg',
      });

      const result = await service.update('hl-1', 'user-1', {
        title: 'Updated Highlight',
        coverUrl: 'https://cdn.example.com/new-cover.jpg',
        storyIds: ['story-1', 'story-2'],
      });

      expect(mockPrismaService.highlight.update).toHaveBeenCalledWith({
        where: { id: 'hl-1' },
        data: {
          title: 'Updated Highlight',
          coverUrl: 'https://cdn.example.com/new-cover.jpg',
          stories: {
            deleteMany: {},
            create: [
              { story: { connect: { id: 'story-1' } } },
              { story: { connect: { id: 'story-2' } } },
            ],
          },
        },
        include: {
          stories: {
            include: {
              story: true,
            },
          },
        },
      });
      expect(result).toHaveProperty('id', 'hl-1');
    });

    it('should update highlight without altering stories when storyIds not provided', async () => {
      mockPrismaService.highlight.findFirst.mockResolvedValue({
        id: 'hl-1',
        profileId: 'user-1',
      });
      mockPrismaService.highlight.update.mockResolvedValue({
        id: 'hl-1',
        title: 'Only Title',
      });

      const result = await service.update('hl-1', 'user-1', {
        title: 'Only Title',
      });

      expect(mockPrismaService.highlight.update).toHaveBeenCalledWith({
        where: { id: 'hl-1' },
        data: {
          title: 'Only Title',
          coverUrl: undefined,
        },
        include: {
          stories: {
            include: {
              story: true,
            },
          },
        },
      });
      expect(result).toHaveProperty('id', 'hl-1');
    });
  });

  describe('remove', () => {
    it('should throw NotFoundException if highlight does not exist or user does not own it', async () => {
      mockPrismaService.highlight.findFirst.mockResolvedValue(null);

      await expect(service.remove('hl-1', 'other-user')).rejects.toThrow(
        AppException,
      );
    });

    it('should delete highlight if user owns it', async () => {
      mockPrismaService.highlight.findFirst.mockResolvedValue({
        id: 'hl-1',
        userId: 'user-1',
      });
      mockPrismaService.highlight.delete.mockResolvedValue({ id: 'hl-1' });

      const result = await service.remove('hl-1', 'user-1');
      expect(mockPrismaService.highlight.delete).toHaveBeenCalledWith({
        where: { id: 'hl-1' },
      });
      expect(result).toEqual({ id: 'hl-1' });
    });
  });
});
