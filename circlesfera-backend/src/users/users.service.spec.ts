import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StripeService } from '../common/stripe/stripe.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let service: UsersService;

  const mockPrismaService = {
    $transaction: vi
      .fn()
      .mockImplementation((cb: any) => cb(mockPrismaService)),
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    profile: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
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

  const mockOutboxService = {
    enqueue: vi.fn().mockResolvedValue({ id: 'outbox-1' }),
    triggerImmediatePublish: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StripeService, useValue: mockStripeService },
        { provide: OutboxService, useValue: mockOutboxService },
        {
          provide: getQueueToken('users-processing'),
          useValue: mockUsersQueue,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    vi.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation((cb: any) =>
      cb(mockPrismaService),
    );
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

  describe('scheduleDeletion', () => {
    it('atomically enqueues the hard-delete job via OutboxService inside a transaction', async () => {
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.scheduleDeletion('user-abc');

      // Returns the scheduled date (30 days from now)
      expect(result).toBeInstanceOf(Date);
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      expect(result.getTime()).toBeGreaterThanOrEqual(
        Date.now() + thirtyDays - 5000,
      );

      // DB update called inside transaction
      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-abc' },
          data: expect.objectContaining({
            isActive: false,
            scheduledDeletionAt: result,
          }),
        }),
      );

      // Outbox enqueue called inside transaction (not usersQueue.add)
      expect(mockOutboxService.enqueue).toHaveBeenCalledWith(
        mockPrismaService, // tx = mock prisma (passed through $transaction cb)
        expect.objectContaining({
          queueName: 'users-processing',
          eventName: 'hard-delete-user',
          payload: { userId: 'user-abc' },
          options: expect.objectContaining({
            jobId: 'delete-user-abc',
          }),
        }),
      );

      // Immediate publish triggered after commit
      expect(mockOutboxService.triggerImmediatePublish).toHaveBeenCalledOnce();

      // Direct queue.add must NOT be called from scheduleDeletion
      expect(mockUsersQueue.add).not.toHaveBeenCalled();
    });

    it('uses $transaction to wrap both DB update and outbox enqueue', async () => {
      mockPrismaService.user.update.mockResolvedValue({});
      await service.scheduleDeletion('user-xyz');
      expect(mockPrismaService.$transaction).toHaveBeenCalledOnce();
    });
  });

  describe('syncUserTier', () => {
    it('should promote user to CREATOR and ELITE if they have an elite plan', async () => {
      mockPrismaService.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u1',
        profiles: [
          {
            id: 'p1',
            accountType: 'PERSONAL',
            verificationLevel: 'BASIC',
            platformSubscriptions: [
              { status: 'ACTIVE', plan: { name: 'Elite' } },
            ],
          },
        ],
      });

      await service.syncUserTier('u1');

      expect(mockPrismaService.profile.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: {
          accountType: 'CREATOR',
          verificationLevel: 'ELITE',
        },
      });
    });

    it('should downgrade plan badge to BASIC when KYC-only (identity is separate)', async () => {
      mockPrismaService.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u2',
        identityVerifiedAt: new Date(),
        profiles: [
          {
            id: 'p2',
            accountType: 'CREATOR',
            verificationLevel: 'VERIFIED',
            platformSubscriptions: [],
          },
        ],
      });

      await service.syncUserTier('u2');

      expect(mockPrismaService.profile.update).toHaveBeenCalledWith({
        where: { id: 'p2' },
        data: {
          accountType: 'PERSONAL',
          verificationLevel: 'BASIC',
        },
      });
    });

    it('should downgrade to BASIC if no subscription and no KYC', async () => {
      mockPrismaService.user.findUnique = vi.fn().mockResolvedValue({
        id: 'u3',
        identityVerifiedAt: null,
        profiles: [
          {
            id: 'p3',
            accountType: 'CREATOR',
            verificationLevel: 'VERIFIED',
            platformSubscriptions: [],
          },
        ],
      });

      await service.syncUserTier('u3');

      expect(mockPrismaService.profile.update).toHaveBeenCalledWith({
        where: { id: 'p3' },
        data: {
          accountType: 'PERSONAL',
          verificationLevel: 'BASIC',
        },
      });
    });
  });
});
