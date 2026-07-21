import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { CloseFriendsService } from './close-friends.service.js';

describe('CloseFriendsService', () => {
  let service: CloseFriendsService;

  const mockPrismaService = {
    closeFriend: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CloseFriendsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CloseFriendsService>(CloseFriendsService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getCloseFriends', () => {
    it('should return list of close friends', async () => {
      mockPrismaService.closeFriend.findMany.mockResolvedValue([
        { id: 'cf-1', userId: 'user-1', friendId: 'friend-1' },
      ]);
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: 'friend-1', email: 'friend@example.com', profile: { username: 'friend' } },
      ]);

      const result = await service.getCloseFriends('user-1');
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('isCloseFriend', true);
    });
  });

  describe('toggleCloseFriend', () => {
    it('should throw BadRequestException if adding self', async () => {
      await expect(
        service.toggleCloseFriend('user-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create close friend entry if not exists', async () => {
      mockPrismaService.closeFriend.findUnique.mockResolvedValue(null);
      mockPrismaService.closeFriend.create.mockResolvedValue({
        id: 'cf-1',
        userId: 'user-1',
        friendId: 'friend-2',
      });

      const result = await service.toggleCloseFriend('user-1', 'friend-2');
      expect(mockPrismaService.closeFriend.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', friendId: 'friend-2' },
      });
      expect(result).toEqual({ isCloseFriend: true });
    });

    it('should delete close friend entry if already exists', async () => {
      mockPrismaService.closeFriend.findUnique.mockResolvedValue({
        id: 'cf-1',
        userId: 'user-1',
        friendId: 'friend-2',
      });

      const result = await service.toggleCloseFriend('user-1', 'friend-2');
      expect(mockPrismaService.closeFriend.delete).toHaveBeenCalledWith({
        where: { id: 'cf-1' },
      });
      expect(result).toEqual({ isCloseFriend: false });
    });
  });
});
