import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let service: UsersService;

  const mockPrismaService = {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    profile: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    follow: {
      findMany: vi.fn(),
    },
    block: {
      findMany: vi.fn(),
    },
  };

  const mockStripeService = {
    createIdentityVerificationSession: vi.fn(),
    getIdentityVerificationSession: vi.fn(),
  };

  const mockUsersQueue = {
    add: vi.fn(),
    getJob: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StripeService, useValue: mockStripeService },
        {
          provide: getQueueToken('users-processing'),
          useValue: mockUsersQueue,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSuggestions', () => {
    it('should return user suggestions excluding follows and blocks', async () => {
      const mockSuggestions = [
        {
          id: 'p1',
          username: 'user_s1',
          fullName: 'User S1',
          avatar: null,
          bio: null,
          user: { id: 's1', verificationLevel: 'BASIC' },
          _count: { followers: 10 },
        },
      ];
      mockPrismaService.profile.findMany
        .mockResolvedValueOnce([{ id: 'my-profile' }])
        .mockResolvedValueOnce(mockSuggestions);

      const limit = 10;
      const result = await service.getSuggestions('1', limit);
      expect(result).toHaveLength(1);
      expect(result[0].profileId).toBe('p1');
      expect(result[0].username).toBe('user_s1');

      const suggestionCall = vi.mocked(mockPrismaService.profile.findMany).mock
        .calls[1][0] as any;
      expect(suggestionCall.where.userId).toEqual({ not: '1' });
      expect(suggestionCall.where.followers.none.followerId).toEqual({
        in: ['my-profile'],
      });
      expect(suggestionCall.take).toBe(limit);
    });
  });

  it('should ban a user', async () => {
    mockPrismaService.user.update.mockResolvedValue({
      id: '1',
      isActive: false,
    });
    const result = await service.banUser('1');
    expect(result.isActive).toBe(false);
  });

  it('should unban a user', async () => {
    mockPrismaService.profile.updateMany.mockResolvedValue({ count: 1 });
    mockPrismaService.user.update.mockResolvedValue({
      id: '1',
      isActive: true,
    });
    const result = await service.unbanUser('1');
    expect(mockPrismaService.profile.updateMany).toHaveBeenCalledWith({
      where: { userId: '1' },
      data: { suspendedUntil: null },
    });
    expect(result.isActive).toBe(true);
  });

  describe('syncUserTier', () => {
    it('should promote user to CREATOR and ELITE if they have an elite plan', async () => {
      mockPrismaService.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u1',
        accountType: 'PERSONAL',
        verificationLevel: 'BASIC',
        platformSubscriptions: [{ status: 'ACTIVE', plan: { name: 'Elite' } }],
      });

      await service.syncUserTier('u1');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: {
          accountType: 'CREATOR',
          verificationLevel: 'ELITE',
        },
      });
    });

    it('should downgrade plan badge to BASIC when KYC-only (identity is separate)', async () => {
      mockPrismaService.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u2',
        accountType: 'CREATOR',
        verificationLevel: 'VERIFIED',
        identityVerifiedAt: new Date(),
        platformSubscriptions: [],
      });

      await service.syncUserTier('u2');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u2' },
        data: {
          accountType: 'PERSONAL',
          verificationLevel: 'BASIC',
        },
      });
    });

    it('should downgrade to BASIC if no subscription and no KYC', async () => {
      mockPrismaService.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u3',
        accountType: 'CREATOR',
        verificationLevel: 'VERIFIED',
        identityVerifiedAt: null,
        platformSubscriptions: [],
      });

      await service.syncUserTier('u3');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'u3' },
        data: {
          accountType: 'PERSONAL',
          verificationLevel: 'BASIC',
        },
      });
    });
  });
});
