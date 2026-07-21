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
      expect(mockPrismaService.audio.create).toHaveBeenCalledWith({ data: dto });
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
