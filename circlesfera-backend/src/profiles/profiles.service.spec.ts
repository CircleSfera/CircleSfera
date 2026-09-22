import { getQueueToken } from '@nestjs/bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { ProfilesService } from './profiles.service.js';

describe('ProfilesService', () => {
  let service: ProfilesService;

  const mockPrismaService: any = {
    profile: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    user: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    platformSubscription: {
      findFirst: vi.fn(),
    },
    block: {
      findFirst: vi.fn(),
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

  const mockUsersService = {
    scheduleDeletion: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfilesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: getQueueToken('ai-processing'), useValue: mockAiQueue },
        { provide: UsersService, useValue: mockUsersService },
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
        AppException,
      );
    });

    it('throws NotFoundException (not Forbidden) when the viewer blocked the author, cached path', async () => {
      const cached = { id: 'p-target', username: 'cacheduser' };
      mockCacheManager.get.mockResolvedValue(cached);
      mockPrismaService.block.findFirst.mockResolvedValue({ id: 'block-1' });

      await expect(
        service.getProfile('cacheduser', 'p-viewer'),
      ).rejects.toThrow(AppException);
      expect(mockPrismaService.block.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { blockerId: 'p-viewer', blockedId: 'p-target' },
            { blockerId: 'p-target', blockedId: 'p-viewer' },
          ],
        },
        select: { id: true },
      });
    });

    it('throws NotFoundException when the author blocked the viewer, DB path', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockPrismaService.profile.findFirst.mockResolvedValue({
        id: 'p-target',
        userId: 'u-target',
        username: 'dbuser',
        verificationLevel: 'BASIC',
        accountType: 'PERSONAL',
        suspendedUntil: null,
        user: null,
        _count: { posts: 0, followers: 0, following: 0 },
      });
      mockPrismaService.platformSubscription.findFirst.mockResolvedValue(null);
      mockPrismaService.block.findFirst.mockResolvedValue({ id: 'block-2' });

      await expect(service.getProfile('dbuser', 'p-viewer')).rejects.toThrow(
        AppException,
      );
      expect(mockCacheManager.set).not.toHaveBeenCalled();
    });

    it('returns the profile normally when there is no block', async () => {
      const cached = { id: 'p-target', username: 'cacheduser' };
      mockCacheManager.get.mockResolvedValue(cached);
      mockPrismaService.block.findFirst.mockResolvedValue(null);

      const result = await service.getProfile('cacheduser', 'p-viewer');
      expect(result).toEqual(cached);
    });

    it('skips the block check entirely when there is no authenticated viewer', async () => {
      const cached = { id: 'p-target', username: 'cacheduser' };
      mockCacheManager.get.mockResolvedValue(cached);

      const result = await service.getProfile('cacheduser');
      expect(result).toEqual(cached);
      expect(mockPrismaService.block.findFirst).not.toHaveBeenCalled();
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

  describe('updateProfile', () => {
    it('should update accountType on Profile and not call user.update when isPrivate is undefined', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue({
        id: 'p-1',
        userId: 'u-1',
        username: 'testuser',
      });
      mockPrismaService.profile.update.mockResolvedValue({
        id: 'p-1',
        userId: 'u-1',
        username: 'testuser',
        accountType: 'CREATOR',
        verificationLevel: 'BASIC',
        user: { settings: { privacyLevel: 'PUBLIC' } },
        _count: { followers: 0, following: 0 },
      });

      const result = await service.updateProfile('p-1', {
        accountType: 'CREATOR',
        bio: 'New bio',
      });

      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
      expect(mockPrismaService.profile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p-1' },
          data: expect.objectContaining({
            accountType: 'CREATOR',
            bio: 'New bio',
          }),
        }),
      );
      expect(result.accountType).toBe('CREATOR');
    });

    it('should update user settings when isPrivate is provided', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue({
        id: 'p-1',
        userId: 'u-1',
        username: 'testuser',
      });
      mockPrismaService.profile.update.mockResolvedValue({
        id: 'p-1',
        userId: 'u-1',
        username: 'testuser',
        accountType: 'PERSONAL',
        verificationLevel: 'BASIC',
        user: { settings: { privacyLevel: 'PRIVATE' } },
        _count: { followers: 0, following: 0 },
      });

      await service.updateProfile('p-1', {
        isPrivate: true,
      });

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: expect.objectContaining({
          settings: expect.any(Object),
        }),
      });
    });

    it('should throw NotFoundException if profile does not exist when updating', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue(null);
      await expect(service.updateProfile('p-missing', {})).rejects.toThrow(
        AppException,
      );
    });

    it('should reset thumbnail/standard URLs when avatar is provided and enqueue embedding', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue({
        id: 'p-1',
        userId: 'u-1',
        username: 'avataruser',
      });
      mockPrismaService.profile.update.mockResolvedValue({
        id: 'p-1',
        userId: 'u-1',
        username: 'avataruser',
        fullName: 'Avatar User',
        bio: 'Bio text',
        accountType: 'PERSONAL',
        verificationLevel: 'BASIC',
        user: { settings: { privacyLevel: 'PUBLIC' } },
        _count: { followers: 0, following: 0 },
      });

      await service.updateProfile('p-1', {
        avatar: 'https://cdn.example.com/avatar.jpg',
        fullName: 'Avatar User',
      });

      expect(mockPrismaService.profile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            thumbnailUrl: null,
            standardUrl: null,
          }),
        }),
      );
      expect(mockAiQueue.add).toHaveBeenCalledWith(
        'generate-profile-embedding',
        expect.objectContaining({
          profileId: 'p-1',
          text: 'avataruser Avatar User Bio text',
        }),
      );

      // Verify catch handler when aiQueue.add rejects
      mockAiQueue.add.mockRejectedValueOnce(new Error('Queue failure'));
      await expect(
        service.updateProfile('p-1', { bio: 'Another bio' }),
      ).resolves.toBeDefined();
    });
  });

  describe('getProfile DB fallback and verification', () => {
    it('loads profile from DB when not in cache and calculates verification and standing', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockPrismaService.profile.findFirst.mockResolvedValue({
        id: 'p-db',
        userId: 'u-db',
        username: 'dbuser',
        verificationLevel: 'BASIC',
        accountType: 'PERSONAL',
        suspendedUntil: null,
        user: {
          id: 'u-db',
          createdAt: new Date('2026-01-01'),
          lastSeenAt: new Date(),
          isActive: true,
          strikeCount: 0,
          emailVerified: new Date(),
          identityVerifiedAt: new Date(),
          signupCountry: 'ES',
          botLabeledAt: null,
          settings: { privacyLevel: 'PUBLIC' },
        },
        _count: { posts: 5, followers: 10, following: 2 },
      });
      mockPrismaService.platformSubscription = {
        findFirst: vi.fn().mockResolvedValue({ id: 'sub-active' }),
      };

      const res: any = await service.getProfile('dbuser');
      expect(res.username).toBe('dbuser');
      expect(res.isVerified).toBe(true);
      expect(res.identityVerified).toBe(true);
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'profile:dbuser',
        expect.any(Object),
        600000,
      );
    });

    it('handles ELITE verificationLevel without platformSubscription', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockPrismaService.profile.findFirst.mockResolvedValue({
        id: 'p-elite',
        userId: 'u-elite',
        username: 'eliteuser',
        verificationLevel: 'ELITE',
        accountType: 'CREATOR',
        user: null,
        _count: { posts: 0, followers: 0, following: 0 },
      });
      mockPrismaService.platformSubscription = {
        findFirst: vi.fn().mockResolvedValue(null),
      };

      const res: any = await service.getProfile('eliteuser');
      expect(res.isVerified).toBe(true);
      expect(res.user).toBeUndefined();
    });
  });

  describe('searchProfiles', () => {
    it('returns empty array when query is empty', async () => {
      const res = await service.searchProfiles('');
      expect(res).toEqual([]);
    });

    it('searches profiles by username or fullName', async () => {
      mockPrismaService.profile.findMany = vi
        .fn()
        .mockResolvedValue([
          { id: 'p-1', username: 'alice', fullName: 'Alice Wonderland' },
        ]);

      const res = await service.searchProfiles('alice');
      expect(res).toHaveLength(1);
      expect(mockPrismaService.profile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        }),
      );
    });
  });

  describe('getMyReferrals', () => {
    it('throws NotFound if user not found', async () => {
      mockPrismaService.user.findUnique = vi.fn().mockResolvedValue(null);
      await expect(service.getMyReferrals('u-missing')).rejects.toThrow(
        AppException,
      );
    });

    it('returns user referrals when found', async () => {
      mockPrismaService.user.findUnique = vi.fn().mockResolvedValue({
        inviteCode: 'INVITE123',
        referrals: [
          {
            id: 'ref-1',
            createdAt: new Date(),
            profiles: [
              { username: 'refUser', fullName: 'Ref User', avatar: null },
            ],
          },
        ],
      });

      const res = await service.getMyReferrals('u-1');
      expect(res.inviteCode).toBe('INVITE123');
      expect(res.referralCount).toBe(1);
      expect(res.referrals[0].profile.username).toBe('refUser');
    });
  });

  describe('getMyProfile', () => {
    it('throws NotFound if profile not found', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue(null);
      await expect(service.getMyProfile('p-missing')).rejects.toThrow(
        AppException,
      );
    });

    it('returns own profile with subscription check and flattened settings', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue({
        id: 'p-me',
        userId: 'u-me',
        username: 'myuser',
        verificationLevel: 'BUSINESS',
        accountType: 'BUSINESS',
        suspendedUntil: null,
        user: {
          id: 'u-me',
          email: 'me@example.com',
          role: 'USER',
          createdAt: new Date(),
          lastSeenAt: new Date(),
          isActive: true,
          strikeCount: 0,
          emailVerified: new Date(),
          inviteCode: 'MYINVITE',
          referredById: null,
          identityVerifiedAt: null,
          signupCountry: 'US',
          botLabeledAt: null,
          settings: { isOnboarded: true, privacyLevel: 'PRIVATE' },
        },
        _count: { followers: 100, following: 50 },
      });
      mockPrismaService.platformSubscription = {
        findFirst: vi.fn().mockResolvedValue(null),
      };

      const res = await service.getMyProfile('p-me');
      expect(res.username).toBe('myuser');
      expect(res.isPrivate).toBe(true);
      expect(res.isVerified).toBe(true);
    });
  });

  describe('deactivateAccount & deleteAccount', () => {
    it('deactivates account and deletes cache', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue({
        id: 'p-1',
        username: 'deactivateuser',
      });
      mockPrismaService.user.update.mockResolvedValue({
        id: 'p-1',
        isActive: false,
      });

      const res = await service.deactivateAccount('p-1');
      expect(res.isActive).toBe(false);
      expect(mockCacheManager.del).toHaveBeenCalledWith(
        'profile:deactivateuser',
      );
    });

    it('schedules account deletion and deletes cache', async () => {
      const scheduledDate = new Date('2026-10-15T00:00:00.000Z');
      mockPrismaService.profile.findUnique.mockResolvedValue({
        id: 'p-del',
        username: 'deleteuser',
      });
      mockUsersService.scheduleDeletion.mockResolvedValue(scheduledDate);

      const res = await service.deleteAccount('p-del');
      expect(res.success).toBe(true);
      expect(res.scheduled_deletion_at).toBe(scheduledDate.toISOString());
      expect(mockCacheManager.del).toHaveBeenCalledWith('profile:deleteuser');
    });
  });
});
