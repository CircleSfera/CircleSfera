import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { AudioService } from './audio.service.js';

describe('AudioService', () => {
  let service: AudioService;

  const mockPrismaService = {
    audio: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    post: {
      findMany: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AudioService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AudioService>(AudioService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new audio track', async () => {
      const dto = {
        title: 'Original Sound',
        artist: 'CircleSfera User',
        url: 'https://cdn.example.com/audio.mp3',
        duration: 30,
      };

      mockPrismaService.audio.create.mockResolvedValue({
        id: 'audio-1',
        ...dto,
      });

      const result = await service.create(dto);
      expect(mockPrismaService.audio.create).toHaveBeenCalledWith({
        data: dto,
      });
      expect(result).toHaveProperty('id', 'audio-1');
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException if audio track does not exist', async () => {
      mockPrismaService.audio.findUnique.mockResolvedValue(null);

      await expect(service.findOne('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return audio track if found', async () => {
      mockPrismaService.audio.findUnique.mockResolvedValue({
        id: 'audio-1',
        title: 'Original Sound',
      });

      const result = await service.findOne('audio-1');
      expect(result).toEqual({ id: 'audio-1', title: 'Original Sound' });
    });
  });

  describe('search', () => {
    it('should search tracks by title or artist', async () => {
      mockPrismaService.audio.findMany.mockResolvedValue([
        { id: 'audio-1', title: 'Pop Track', artist: 'Artist A' },
      ]);

      const result = await service.search('Pop');
      expect(mockPrismaService.audio.findMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('findAll', () => {
    it('should return all audio tracks', async () => {
      mockPrismaService.audio.findMany.mockResolvedValue([
        { id: 'audio-1', title: 'Track 1' },
      ]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
    });
  });

  describe('getTrending', () => {
    it('should return top 10 trending audio tracks', async () => {
      mockPrismaService.audio.findMany.mockResolvedValue([
        { id: 'audio-1', title: 'Trending 1' },
      ]);
      const result = await service.getTrending();
      expect(result).toHaveLength(1);
      expect(mockPrismaService.audio.findMany).toHaveBeenCalledWith({
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findAllPaginated', () => {
    it('should return paginated items without search', async () => {
      mockPrismaService.audio.findMany.mockResolvedValue([
        { id: 'audio-1', title: 'Track 1' },
      ]);
      mockPrismaService.audio.count.mockResolvedValue(1);

      const result = await service.findAllPaginated(1, 10);
      expect(result.data).toHaveLength(1);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should return paginated items with search filter', async () => {
      mockPrismaService.audio.findMany.mockResolvedValue([
        { id: 'audio-2', title: 'Rock Song' },
      ]);
      mockPrismaService.audio.count.mockResolvedValue(1);

      const result = await service.findAllPaginated(1, 10, 'Rock');
      expect(result.data).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('should throw NotFoundException if audio track does not exist', async () => {
      mockPrismaService.audio.findUnique.mockResolvedValue(null);

      await expect(
        service.update('invalid-id', { title: 'New' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update audio track if exists', async () => {
      mockPrismaService.audio.findUnique.mockResolvedValue({ id: 'audio-1' });
      mockPrismaService.audio.update.mockResolvedValue({
        id: 'audio-1',
        title: 'Updated Title',
      });

      const result = await service.update('audio-1', {
        title: 'Updated Title',
      });
      expect(result.title).toBe('Updated Title');
    });
  });

  describe('getAudioPosts', () => {
    it('should return public posts utilizing the audio track', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([
        { id: 'post-1', audioId: 'audio-1' },
      ]);

      const result = await service.getAudioPosts('audio-1');
      expect(result).toHaveLength(1);
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith({
        where: {
          audioId: 'audio-1',
          visibility: 'PUBLIC',
          moderationStatus: 'VISIBLE',
        },
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('delete', () => {
    it('should throw NotFoundException if audio track does not exist', async () => {
      mockPrismaService.audio.findUnique.mockResolvedValue(null);

      await expect(service.delete('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should delete audio track if exists', async () => {
      mockPrismaService.audio.findUnique.mockResolvedValue({ id: 'audio-1' });
      mockPrismaService.audio.delete.mockResolvedValue({ id: 'audio-1' });

      const result = await service.delete('audio-1');
      expect(mockPrismaService.audio.delete).toHaveBeenCalledWith({
        where: { id: 'audio-1' },
      });
      expect(result).toEqual({ id: 'audio-1' });
    });
  });
});
