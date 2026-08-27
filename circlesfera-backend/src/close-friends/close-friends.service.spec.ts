import { BadRequestException, NotFoundException } from '@nestjs/common';
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
    profile: {
      findUnique: vi.fn(),
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

  describe('getCloseFriends', () => {
    it('returns friend profiles with isCloseFriend flag', async () => {
      mockPrismaService.closeFriend.findMany.mockResolvedValue([
        {
          id: 'cf-1',
          profileId: 'profile-1',
          friendId: 'friend-1',
          friend: {
            id: 'friend-1',
            username: 'alice',
            fullName: 'Alice',
            avatar: null,
            standardUrl: null,
            thumbnailUrl: null,
            userId: 'user-2',
          },
        },
      ]);

      const result = await service.getCloseFriends('profile-1');

      expect(mockPrismaService.closeFriend.findMany).toHaveBeenCalledWith({
        where: { profileId: 'profile-1' },
        include: expect.any(Object),
      });
      expect(result[0]).toMatchObject({
        id: 'friend-1',
        username: 'alice',
        isCloseFriend: true,
      });
    });
  });

  describe('toggleCloseFriend', () => {
    it('rejects adding yourself', async () => {
      await expect(
        service.toggleCloseFriend('profile-1', 'profile-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects unknown friend profile', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue(null);
      await expect(
        service.toggleCloseFriend('profile-1', 'missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates close friend when missing', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue({
        id: 'friend-2',
      });
      mockPrismaService.closeFriend.findUnique.mockResolvedValue(null);
      mockPrismaService.closeFriend.create.mockResolvedValue({
        id: 'cf-2',
        profileId: 'profile-1',
        friendId: 'friend-2',
      });

      const result = await service.toggleCloseFriend('profile-1', 'friend-2');
      expect(mockPrismaService.closeFriend.create).toHaveBeenCalledWith({
        data: { profileId: 'profile-1', friendId: 'friend-2' },
      });
      expect(result).toEqual({ isCloseFriend: true });
    });

    it('removes existing close friend', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue({
        id: 'friend-2',
      });
      mockPrismaService.closeFriend.findUnique.mockResolvedValue({
        id: 'cf-2',
        profileId: 'profile-1',
        friendId: 'friend-2',
      });

      const result = await service.toggleCloseFriend('profile-1', 'friend-2');
      expect(mockPrismaService.closeFriend.delete).toHaveBeenCalledWith({
        where: { id: 'cf-2' },
      });
      expect(result).toEqual({ isCloseFriend: false });
    });
  });
});
