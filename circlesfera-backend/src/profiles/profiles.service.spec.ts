import { getQueueToken } from '@nestjs/bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProfilesService } from './profiles.service.js';

describe('ProfilesService', () => {
  let service: ProfilesService;

  const mockPrismaService = {
    profile: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  };

  const mockCacheManager = {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  };

  const mockAiQueue = {
    add: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: getQueueToken('ai-processing'), useValue: mockAiQueue },
      ],
    }).compile();

    service = module.get<ProfilesService>(ProfilesService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProfile', () => {
    it('should return cached profile if available', async () => {
      const cached = { username: 'cacheduser', bio: 'Cached bio' };
      mockCacheManager.get.mockResolvedValue(cached);

      const result = await service.getProfile('cacheduser');
      expect(mockCacheManager.get).toHaveBeenCalledWith('profile:cacheduser');
      expect(result).toEqual(cached);
    });

    it('should throw NotFoundException if profile is not found in cache or DB', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockPrismaService.profile.findFirst.mockResolvedValue(null);

      await expect(service.getProfile('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('checkUsernameAvailability', () => {
    it('should return available true if username is free and valid', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue(null);

      const result = await service.checkUsernameAvailability('newuser');
      expect(result).toEqual({
        available: true,
        message: 'Username is available',
      });
    });

    it('should return available false if username exists', async () => {
      mockPrismaService.profile.findFirst.mockResolvedValue({ id: 'p-1' });

      const result = await service.checkUsernameAvailability('existinguser');
      expect(result).toEqual({
        available: false,
        message: 'This username is already taken',
      });
    });

    it('should return available false if username format is invalid', async () => {
      const result = await service.checkUsernameAvailability('a');
      expect(result.available).toBe(false);
    });
  });
});
