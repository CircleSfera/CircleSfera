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
    $transaction: vi.fn((cb: any) => cb(mockPrismaService)),
    profile: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    platformSubscription: {
      findFirst: vi.fn(),
    },
    block: {
      findFirst: vi.fn(),
    },
    media: {
      create: vi.fn().mockResolvedValue({ id: 'media-1' }),
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

    it('skips the block check when the viewer is looking at their own profile', async () => {
      const cached = { id: 'p-self', username: 'cacheduser' };
      mockCacheManager.get.mockResolvedValue(cached);

      const result = await service.getProfile('cacheduser', 'p-self');
      expect(result).toEqual(cached);
      expect(mockPrismaService.block.findFirst).not.toHaveBeenCalled();
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
    describe('profile colour', () => {
      const stored = (verificationLevel: string) => ({
        id: 'p-1',
        userId: 'u-1',
        username: 'testuser',
        verificationLevel,
      });
      const saved = {
        id: 'p-1',
        userId: 'u-1',
        username: 'testuser',
        user: { settings: { privacyLevel: 'PUBLIC' } },
        _count: { followers: 0, following: 0 },
      };

      it.each(['BASIC', 'VERIFIED'])(
        'refuses a colour for a Profile on the %s level',
        async (level) => {
          mockPrismaService.profile.findUnique.mockResolvedValue(stored(level));
          mockPrismaService.profile.update.mockClear();

          await expect(
            service.updateProfile('p-1', { accentColor: 'teal' }),
          ).rejects.toMatchObject({ status: 403 });
          expect(mockPrismaService.profile.update).not.toHaveBeenCalled();
        },
      );

      it.each(['ELITE', 'BUSINESS'])(
        'saves the colour of a Profile on the %s plan',
        async (level) => {
          mockPrismaService.profile.findUnique.mockResolvedValue(stored(level));
          mockPrismaService.profile.update.mockResolvedValue(saved);

          await service.updateProfile('p-1', { accentColor: 'teal' });

          expect(mockPrismaService.profile.update).toHaveBeenLastCalledWith(
            expect.objectContaining({
              data: expect.objectContaining({ accentColor: 'teal' }),
            }),
          );
        },
      );

      it('lets any Profile go back to the colour of the app', async () => {
        mockPrismaService.profile.findUnique.mockResolvedValue(stored('BASIC'));
        mockPrismaService.profile.update.mockResolvedValue(saved);

        await service.updateProfile('p-1', { accentColor: null });

        expect(mockPrismaService.profile.update).toHaveBeenLastCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ accentColor: null }),
          }),
        );
      });
    });

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

    it('does not enqueue a profile embedding when username/fullName/bio are all empty', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue({
        id: 'p-1',
        userId: 'u-1',
        username: 'testuser',
      });
      mockPrismaService.profile.update.mockResolvedValue({
        id: 'p-1',
        userId: 'u-1',
        username: '',
        fullName: null,
        bio: null,
        accountType: 'PERSONAL',
        verificationLevel: 'BASIC',
        user: { settings: { privacyLevel: 'PUBLIC' } },
        _count: { followers: 0, following: 0 },
      });

      await service.updateProfile('p-1', { bio: '' });

      expect(mockAiQueue.add).not.toHaveBeenCalled();
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

    it('creates a linked Media row for a new avatar and links avatarMediaId', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue({
        id: 'p-1',
        userId: 'u-1',
        username: 'avataruser',
      });
      mockPrismaService.media.create.mockResolvedValueOnce({
        id: 'avatar-media-1',
      });
      mockPrismaService.profile.update.mockResolvedValue({
        id: 'p-1',
        userId: 'u-1',
        username: 'avataruser',
        user: { settings: { privacyLevel: 'PUBLIC' } },
        _count: { followers: 0, following: 0 },
      });

      await service.updateProfile('p-1', {
        avatar: 'https://cdn.example.com/new-avatar.jpg',
      });

      expect(mockPrismaService.media.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: 'IMAGE',
          status: 'READY',
          url: 'https://cdn.example.com/new-avatar.jpg',
        }),
      });
      expect(mockPrismaService.profile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            avatarMediaId: 'avatar-media-1',
          }),
        }),
      );
    });

    it('does not create a Media row when avatar is not part of the update', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue({
        id: 'p-1',
        userId: 'u-1',
        username: 'nochange',
      });
      mockPrismaService.profile.update.mockResolvedValue({
        id: 'p-1',
        userId: 'u-1',
        username: 'nochange',
        user: { settings: { privacyLevel: 'PUBLIC' } },
        _count: { followers: 0, following: 0 },
      });

      await service.updateProfile('p-1', { bio: 'just a bio change' });

      expect(mockPrismaService.media.create).not.toHaveBeenCalled();
    });

    it('clears avatarMediaId (not just avatar) when the avatar is explicitly cleared', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue({
        id: 'p-1',
        userId: 'u-1',
        username: 'clearer',
      });
      mockPrismaService.profile.update.mockResolvedValue({
        id: 'p-1',
        userId: 'u-1',
        username: 'clearer',
        avatar: null,
        user: { settings: { privacyLevel: 'PUBLIC' } },
        _count: { followers: 0, following: 0 },
      });

      await service.updateProfile('p-1', { avatar: null as unknown as string });

      expect(mockPrismaService.media.create).not.toHaveBeenCalled();
      expect(mockPrismaService.profile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            avatar: null,
            avatarMediaId: null,
          }),
        }),
      );
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

    it.each([
      ['ELITE', 'teal'],
      ['BUSINESS', 'teal'],
      ['VERIFIED', null],
      ['BASIC', null],
    ])(
      'a Profile on the %s level shows the colour %s',
      async (level, shown) => {
        mockCacheManager.get.mockResolvedValue(null);
        mockPrismaService.profile.findFirst.mockResolvedValue({
          id: 'p-colour',
          userId: 'u-colour',
          username: 'colouruser',
          verificationLevel: level,
          accountType: 'CREATOR',
          // The choice stays stored when the plan that includes it ends.
          accentColor: 'teal',
          user: null,
          _count: { posts: 0, followers: 0, following: 0 },
        });
        mockPrismaService.platformSubscription = {
          findFirst: vi.fn().mockResolvedValue(null),
        };
        mockPrismaService.monetization = {
          findUnique: vi.fn().mockResolvedValue(null),
        };

        const res: any = await service.getProfile('colouruser');
        expect(res.accentColor).toBe(shown);
      },
    );

    it.each([
      ['BUSINESS', true, true],
      ['BUSINESS', false, false],
      // The payout account of a company without the Business plan.
      ['ELITE', true, false],
      ['BASIC', true, false],
    ])(
      'a Profile on the %s level with a verified company account (%s) shows verified company: %s',
      async (level, verifiedCompany, shown) => {
        mockCacheManager.get.mockResolvedValue(null);
        mockPrismaService.profile.findFirst.mockResolvedValue({
          id: 'p-company',
          userId: 'u-company',
          username: 'companyuser',
          verificationLevel: level,
          accountType: 'BUSINESS',
          user: null,
          _count: { posts: 0, followers: 0, following: 0 },
        });
        mockPrismaService.platformSubscription = {
          findFirst: vi.fn().mockResolvedValue(null),
        };
        mockPrismaService.monetization = {
          findUnique: vi.fn().mockResolvedValue({ verifiedCompany }),
        };

        const res: any = await service.getProfile('companyuser');
        expect(res.companyVerified).toBe(shown);
      },
    );

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

    it('never returns deactivated accounts, even to anonymous viewers', async () => {
      mockPrismaService.profile.findMany = vi.fn().mockResolvedValue([]);

      await service.searchProfiles('alice');

      const { where } = mockPrismaService.profile.findMany.mock.calls[0][0];
      expect(where.user).toEqual({ deactivatedAt: null });
      expect(where).not.toHaveProperty('blocking');
      expect(where).not.toHaveProperty('blockedBy');
    });

    it('hides Profiles in a block relation with the viewer, in both directions', async () => {
      mockPrismaService.profile.findMany = vi.fn().mockResolvedValue([]);

      await service.searchProfiles('alice', 'viewer-1');

      const { where } = mockPrismaService.profile.findMany.mock.calls[0][0];
      expect(where.user).toEqual({ deactivatedAt: null });
      expect(where.AND).toEqual([
        {
          user: { isTestAccount: false },
          blocking: { none: { blockedId: 'viewer-1' } },
          blockedBy: { none: { blockerId: 'viewer-1' } },
        },
      ]);
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
      mockPrismaService.monetization = {
        findUnique: vi.fn().mockResolvedValue({ verifiedCompany: true }),
      };

      const res = await service.getMyProfile('p-me');
      expect(res.username).toBe('myuser');
      expect(res.isPrivate).toBe(true);
      expect(res.isVerified).toBe(true);
      // The owner sees the same company state as everyone else.
      expect(res.companyVerified).toBe(true);
      // The badge is looked for among the plans of this Profile, not among
      // those of the person's other Profiles.
      expect(
        mockPrismaService.platformSubscription.findFirst.mock.calls[0][0].where,
      ).toMatchObject({ profileId: 'p-me' });
      expect(
        mockPrismaService.platformSubscription.findFirst.mock.calls[0][0].where,
      ).not.toHaveProperty('userId');
      // A session that names no sign-in reads the account.
      expect(res.user?.email).toBe('me@example.com');
      expect(res.emailConfirmed).toBe(true);
    });

    it('shows the email of the sign-in of the session, and whether that one is verified', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue({
        id: 'p-shop',
        userId: 'u-me',
        username: 'myshop',
        verificationLevel: 'BASIC',
        suspendedUntil: null,
        user: {
          id: 'u-me',
          email: 'me@example.com',
          emailVerified: new Date(),
          isActive: true,
          settings: { isOnboarded: true, privacyLevel: 'PUBLIC' },
        },
        _count: { followers: 0, following: 0, strikes: 0 },
      });
      mockPrismaService.platformSubscription = {
        findFirst: vi.fn().mockResolvedValue(null),
      };
      mockPrismaService.signIn = {
        findFirst: vi.fn().mockResolvedValue({
          email: 'shop@example.com',
          emailVerified: null,
        }),
      };

      const res = await service.getMyProfile('p-shop', 'sign-in-own');

      // Looked for inside the account of the Profile.
      expect(mockPrismaService.signIn.findFirst).toHaveBeenCalledWith({
        where: { id: 'sign-in-own', userId: 'u-me' },
        select: { email: true, emailVerified: true },
      });
      expect(res.user?.email).toBe('shop@example.com');
      expect(res.emailConfirmed).toBe(false);
      expect(res.emailVerified).toBeNull();
    });
  });

  describe('deactivateAccount & deleteAccount', () => {
    it('deactivates account and deletes cache', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue({
        id: 'p-1',
        username: 'deactivateuser',
      });
      mockPrismaService.user.update.mockResolvedValue({
        id: 'u-1',
        isActive: false,
      });

      const res = await service.deactivateAccount('u-1', 'p-1');
      expect(res.isActive).toBe(false);
      // Regression: the profile id used to be passed where a user id belongs.
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u-1' },
        data: { isActive: false, deactivatedAt: expect.any(Date) },
      });
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

      const res = await service.deleteAccount('u-del', 'p-del');
      expect(res.success).toBe(true);
      expect(mockUsersService.scheduleDeletion).toHaveBeenCalledWith('u-del');
      expect(res.scheduled_deletion_at).toBe(scheduledDate.toISOString());
      expect(mockCacheManager.del).toHaveBeenCalledWith('profile:deleteuser');
    });
  });

  describe('multi-profile (One Identity, Multiple Profiles)', () => {
    describe('getMyProfiles', () => {
      it('returns all profiles for a user and calculates isSuspended correctly', async () => {
        const futureDate = new Date(Date.now() + 100000);
        mockPrismaService.profile.findMany.mockResolvedValue([
          {
            id: 'p-1',
            username: 'persona_one',
            fullName: 'Persona One',
            suspendedUntil: null,
            _count: { posts: 5, followers: 10, following: 2 },
          },
          {
            id: 'p-2',
            username: 'persona_two',
            fullName: 'Persona Two',
            suspendedUntil: futureDate,
            _count: { posts: 0, followers: 0, following: 0 },
          },
        ]);

        const profiles = await service.getMyProfiles('u-1');

        expect(mockPrismaService.profile.findMany).toHaveBeenCalledWith({
          where: { userId: 'u-1' },
          orderBy: { createdAt: 'asc' },
          select: expect.any(Object),
        });
        expect(profiles).toHaveLength(2);
        expect(profiles[0].isSuspended).toBe(false);
        expect(profiles[1].isSuspended).toBe(true);
      });
    });

    describe('createProfile', () => {
      it('creates an additional profile under the user and enqueues embedding', async () => {
        mockPrismaService.profile.count.mockResolvedValue(1);
        mockPrismaService.profile.findFirst.mockResolvedValue(null); // username available
        mockPrismaService.profile.create.mockResolvedValue({
          id: 'p-new',
          userId: 'u-1',
          username: 'persona_creative',
          fullName: 'Creative Persona',
          bio: 'Artist and designer',
        });

        const res = await service.createProfile('u-1', {
          username: 'persona_creative',
          fullName: 'Creative Persona',
          bio: 'Artist and designer',
          accountType: 'CREATOR',
        });

        expect(mockPrismaService.profile.count).toHaveBeenCalledWith({
          where: { userId: 'u-1' },
        });
        expect(mockPrismaService.profile.create).toHaveBeenCalledWith({
          data: {
            userId: 'u-1',
            username: 'persona_creative',
            fullName: 'Creative Persona',
            bio: 'Artist and designer',
            avatar: null,
            website: null,
            location: null,
            accountType: 'CREATOR',
          },
        });
        expect(mockAiQueue.add).toHaveBeenCalledWith(
          'generate-profile-embedding',
          {
            profileId: 'p-new',
            text: 'persona_creative Creative Persona Artist and designer',
          },
        );
        expect(res.id).toBe('p-new');
      });

      it('creates a BUSINESS profile under the user identity with business accountType', async () => {
        mockPrismaService.profile.count.mockResolvedValue(2);
        mockPrismaService.profile.findFirst.mockResolvedValue(null);
        mockPrismaService.profile.create.mockResolvedValue({
          id: 'p-biz',
          userId: 'u-1',
          username: 'acme_corp',
          fullName: 'Acme Corporation',
          bio: 'Official brand presence',
          accountType: 'BUSINESS',
        });

        const res = await service.createProfile('u-1', {
          username: 'acme_corp',
          fullName: 'Acme Corporation',
          bio: 'Official brand presence',
          accountType: 'BUSINESS',
        });

        expect(mockPrismaService.profile.create).toHaveBeenCalledWith({
          data: {
            userId: 'u-1',
            username: 'acme_corp',
            fullName: 'Acme Corporation',
            bio: 'Official brand presence',
            avatar: null,
            website: null,
            location: null,
            accountType: 'BUSINESS',
          },
        });
        expect(res.accountType).toBe('BUSINESS');
      });

      it('lets an identity with a Profile on the Business plan have up to 10', async () => {
        mockPrismaService.profile.count.mockResolvedValue(5);
        mockPrismaService.profile.findFirst.mockResolvedValueOnce({
          id: 'p-business',
        });
        mockPrismaService.profile.findUnique.mockResolvedValue(null);
        mockPrismaService.profile.create.mockResolvedValue({
          id: 'p-6',
          username: 'profile_six',
        });

        await service.createProfile('u-1', { username: 'profile_six' });

        expect(mockPrismaService.profile.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { userId: 'u-1', verificationLevel: 'BUSINESS' },
          }),
        );
        expect(mockPrismaService.profile.create).toHaveBeenCalled();
      });

      it('stops an identity on the Business plan at 10 profiles', async () => {
        mockPrismaService.profile.count.mockResolvedValue(10);
        mockPrismaService.profile.findFirst.mockResolvedValueOnce({
          id: 'p-business',
        });
        mockPrismaService.profile.create.mockClear();

        await expect(
          service.createProfile('u-1', { username: 'profile_eleven' }),
        ).rejects.toThrow(
          expect.objectContaining({
            message: expect.stringContaining('Maximum limit of 10 profiles'),
          }),
        );
        expect(mockPrismaService.profile.create).not.toHaveBeenCalled();
      });

      it('rejects creation when user has already reached 5 profiles', async () => {
        mockPrismaService.profile.count.mockResolvedValue(5);
        mockPrismaService.profile.findFirst.mockResolvedValueOnce(null);
        mockPrismaService.profile.create.mockClear();

        await expect(
          service.createProfile('u-1', { username: 'profile_six' }),
        ).rejects.toThrow(
          expect.objectContaining({
            message: expect.stringContaining('Maximum limit of 5 profiles'),
          }),
        );
        expect(mockPrismaService.profile.create).not.toHaveBeenCalled();
      });

      it('rejects creation when username is already taken', async () => {
        mockPrismaService.profile.count.mockResolvedValue(2);
        mockPrismaService.profile.findFirst.mockResolvedValue({
          id: 'existing-id',
        });

        await expect(
          service.createProfile('u-1', { username: 'taken_user' }),
        ).rejects.toThrow(
          expect.objectContaining({
            message: 'This username is already taken',
          }),
        );
        expect(mockPrismaService.profile.create).not.toHaveBeenCalled();
      });

      it('rejects creation when username format is invalid', async () => {
        mockPrismaService.profile.count.mockResolvedValue(1);

        await expect(
          service.createProfile('u-1', {
            username: 'invalid name with spaces',
          }),
        ).rejects.toThrow();
        expect(mockPrismaService.profile.create).not.toHaveBeenCalled();
      });
    });

    describe('switchProfile', () => {
      it('allows switching to a valid profile owned by the user', async () => {
        const targetProfile = {
          id: 'p-2',
          userId: 'u-1',
          username: 'persona_two',
          isAccountBanned: false,
          suspendedUntil: null,
        };
        mockPrismaService.profile.findUnique.mockResolvedValue(targetProfile);

        const res = await service.switchProfile('u-1', 'p-2');

        expect(mockPrismaService.profile.findUnique).toHaveBeenCalledWith({
          where: { id: 'p-2' },
        });
        expect(res).toEqual(targetProfile);
      });

      it('rejects switching if profile belongs to a different user', async () => {
        mockPrismaService.profile.findUnique.mockResolvedValue({
          id: 'p-other',
          userId: 'u-stranger',
          username: 'stranger',
          isAccountBanned: false,
        });

        await expect(service.switchProfile('u-1', 'p-other')).rejects.toThrow(
          expect.objectContaining({
            message: expect.stringContaining(
              'Profile not found or does not belong to this account',
            ),
          }),
        );
      });

      it('rejects switching if target profile is account banned', async () => {
        mockPrismaService.profile.findUnique.mockResolvedValue({
          id: 'p-banned',
          userId: 'u-1',
          username: 'banned_persona',
          isAccountBanned: true,
          accountBanReason: 'Severe terms violation',
        });

        await expect(service.switchProfile('u-1', 'p-banned')).rejects.toThrow(
          expect.objectContaining({
            message: expect.stringContaining('Target profile is banned'),
          }),
        );
      });

      it('rejects switching if target profile is suspended', async () => {
        const futureDate = new Date(Date.now() + 3600000);
        mockPrismaService.profile.findUnique.mockResolvedValue({
          id: 'p-suspended',
          userId: 'u-1',
          username: 'suspended_persona',
          isAccountBanned: false,
          suspendedUntil: futureDate,
        });

        await expect(
          service.switchProfile('u-1', 'p-suspended'),
        ).rejects.toThrow(
          expect.objectContaining({
            message: expect.stringContaining('Target profile is suspended'),
          }),
        );
      });
    });
  });
});
