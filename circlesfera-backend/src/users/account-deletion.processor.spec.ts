import type { Queue } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StripeService } from '../common/stripe/stripe.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AccountDeletionProcessor } from './account-deletion.processor.js';
import type { UsersService } from './users.service.js';

describe('AccountDeletionProcessor', () => {
  let processor: AccountDeletionProcessor;
  let mockPrisma: any;
  let mockUsersService: any;
  let mockStripeService: any;
  let mockEventEmitter: any;
  let mockQueue: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
      searchHistory: {
        deleteMany: vi.fn(),
      },
    };

    mockUsersService = {
      deleteUser: vi.fn(),
      deleteScheduledUser: vi.fn().mockResolvedValue(true),
    };

    mockStripeService = {
      listSubscriptionsForCustomer: vi.fn().mockResolvedValue([]),
      cancelSubscription: vi.fn().mockResolvedValue({}),
    };

    mockEventEmitter = {
      emit: vi.fn(),
      emitAsync: vi.fn().mockResolvedValue([]),
    };

    mockQueue = {
      add: vi.fn(),
    };

    processor = new AccountDeletionProcessor(
      mockPrisma as unknown as PrismaService,
      mockUsersService as unknown as UsersService,
      mockStripeService as unknown as StripeService,
      mockEventEmitter,
      mockQueue as unknown as Queue,
    );
  });

  describe('hardDeleteUser - Stale Job & Race Condition Protection', () => {
    it('aborts hard delete and protects restored accounts (isActive=true, deletedAt=null)', async () => {
      // User was restored during 30-day grace period
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-restored',
        isActive: true,
        deletedAt: null,
        scheduledDeletionAt: null,
        stripeCustomerId: 'cus_123',
      });

      await processor.hardDeleteUser('user-restored');

      // Must NOT touch Stripe
      expect(
        mockStripeService.listSubscriptionsForCustomer,
      ).not.toHaveBeenCalled();
      expect(mockStripeService.cancelSubscription).not.toHaveBeenCalled();

      // Must NOT emit hard_deleted event
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();

      // Must NOT delete from database
      expect(mockUsersService.deleteScheduledUser).not.toHaveBeenCalled();
      expect(mockUsersService.deleteUser).not.toHaveBeenCalled();
    });

    it('executes hard delete when account is legitimately scheduled for deletion', async () => {
      const scheduledDate = new Date(Date.now() - 1000);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-scheduled',
        isActive: false,
        deletedAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
        scheduledDeletionAt: scheduledDate,
        stripeCustomerId: 'cus_scheduled_456',
        profiles: [
          { id: 'profile-scheduled-1' },
          { id: 'profile-scheduled-2' },
        ],
      });

      mockStripeService.listSubscriptionsForCustomer.mockResolvedValue([
        { id: 'sub_abc' },
      ]);

      await processor.hardDeleteUser('user-scheduled');

      // Cancels active subscriptions
      expect(
        mockStripeService.listSubscriptionsForCustomer,
      ).toHaveBeenCalledWith('cus_scheduled_456');
      expect(mockStripeService.cancelSubscription).toHaveBeenCalledWith(
        'sub_abc',
      );

      // Emits canonical domain event with userId, profileIds, and profileId via emitAsync
      expect(mockEventEmitter.emitAsync).toHaveBeenCalledWith(
        'user.hard_deleted',
        expect.objectContaining({
          userId: 'user-scheduled',
          profileIds: ['profile-scheduled-1', 'profile-scheduled-2'],
          profileId: 'profile-scheduled-1',
        }),
      );

      // Calls atomic deleteScheduledUser
      expect(mockUsersService.deleteScheduledUser).toHaveBeenCalledWith(
        'user-scheduled',
      );
    });

    it('safely handles concurrent restoration right before database deletion', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-raced',
        isActive: false,
        deletedAt: new Date(),
        scheduledDeletionAt: new Date(),
        stripeCustomerId: null,
        profiles: [{ id: 'profile-raced-1' }],
      });

      // deleteScheduledUser returns false because user was restored in DB concurrently
      mockUsersService.deleteScheduledUser.mockResolvedValue(false);

      await expect(
        processor.hardDeleteUser('user-raced'),
      ).resolves.toBeUndefined();
      expect(mockUsersService.deleteScheduledUser).toHaveBeenCalledWith(
        'user-raced',
      );
    });

    it('ignores non-existent user safely', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await processor.hardDeleteUser('user-not-found');

      expect(
        mockStripeService.listSubscriptionsForCustomer,
      ).not.toHaveBeenCalled();
      expect(mockEventEmitter.emitAsync).not.toHaveBeenCalled();
      expect(mockUsersService.deleteScheduledUser).not.toHaveBeenCalled();
    });
  });

  describe('Cascade Deletion & Explicit Ordering', () => {
    it('strictly awaits emitAsync before calling deleteScheduledUser (explicit ordering)', async () => {
      const executionOrder: string[] = [];

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-order',
        isActive: false,
        deletedAt: new Date(),
        scheduledDeletionAt: new Date(Date.now() - 1000),
        stripeCustomerId: null,
        profiles: [{ id: 'prof-order-1' }],
      });

      mockEventEmitter.emitAsync.mockImplementation(async () => {
        executionOrder.push('emitAsync');
      });

      mockUsersService.deleteScheduledUser.mockImplementation(async () => {
        executionOrder.push('deleteScheduledUser');
        return true;
      });

      await processor.hardDeleteUser('user-order');

      expect(executionOrder).toEqual(['emitAsync', 'deleteScheduledUser']);
    });

    it('cleans up profile media assets (avatar, cover, variants) via media.delete_batch', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-media',
        isActive: false,
        deletedAt: new Date(),
        scheduledDeletionAt: new Date(Date.now() - 1000),
        stripeCustomerId: null,
        profiles: [
          {
            id: 'prof-1',
            avatar: 'https://cdn.example.com/avatar1.jpg',
            standardUrl: 'https://cdn.example.com/avatar1-std.jpg',
            thumbnailUrl: 'https://cdn.example.com/avatar1-thumb.jpg',
            cover: 'https://cdn.example.com/cover1.jpg',
            coverStandardUrl: null,
            coverThumbnailUrl: null,
          },
        ],
      });

      mockUsersService.deleteScheduledUser.mockResolvedValue(true);

      await processor.hardDeleteUser('user-media');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith('media.delete_batch', {
        mediaUrls: expect.arrayContaining([
          'https://cdn.example.com/avatar1.jpg',
          'https://cdn.example.com/avatar1-std.jpg',
          'https://cdn.example.com/avatar1-thumb.jpg',
          'https://cdn.example.com/cover1.jpg',
        ]),
      });

      expect(mockEventEmitter.emitAsync).toHaveBeenCalledWith(
        'user.hard_deleted',
        expect.objectContaining({
          userId: 'user-media',
          mediaUrls: expect.arrayContaining([
            'https://cdn.example.com/avatar1.jpg',
            'https://cdn.example.com/cover1.jpg',
          ]),
        }),
      );
    });

    it('ensures database deletion succeeds even if domain event listeners fail or records were cascaded', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-resilient',
        isActive: false,
        deletedAt: new Date(),
        scheduledDeletionAt: new Date(Date.now() - 1000),
        stripeCustomerId: null,
        profiles: [{ id: 'prof-resilient-1' }],
      });

      // Simulate a listener failing or throwing because records were already cascade-deleted
      mockEventEmitter.emitAsync.mockRejectedValue(
        new Error('Listener failed: records already cascaded'),
      );

      mockUsersService.deleteScheduledUser.mockResolvedValue(true);

      // Deletion must NOT reject; it must catch the error and still execute deleteScheduledUser
      await expect(
        processor.hardDeleteUser('user-resilient'),
      ).resolves.toBeUndefined();

      expect(mockUsersService.deleteScheduledUser).toHaveBeenCalledWith(
        'user-resilient',
      );
    });

    it('throws UnrecoverableError if userId is empty', async () => {
      await expect(processor.hardDeleteUser('')).rejects.toThrow(
        'Missing userId for hardDeleteUser',
      );
    });

    it('catches and logs Stripe subscription cancellation errors gracefully', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-stripe-err',
        isActive: false,
        deletedAt: new Date(Date.now() - 35 * 24 * 3600 * 1000),
        scheduledDeletionAt: new Date(Date.now() - 1000),
        stripeCustomerId: 'cus_err',
        profiles: [],
      });
      mockStripeService.listSubscriptionsForCustomer.mockRejectedValue(
        new Error('Stripe API unreachable'),
      );
      mockUsersService.deleteScheduledUser.mockResolvedValue(true);

      await expect(
        processor.hardDeleteUser('user-stripe-err'),
      ).resolves.toBeUndefined();
      expect(mockUsersService.deleteScheduledUser).toHaveBeenCalledWith(
        'user-stripe-err',
      );
    });

    it('rethrows unexpected error in hardDeleteUser', async () => {
      mockPrisma.user.findUnique.mockRejectedValue(
        new Error('Fatal DB failure'),
      );

      await expect(processor.hardDeleteUser('user-fatal')).rejects.toThrow(
        'Fatal DB failure',
      );
    });
  });

  describe('process() router', () => {
    it('dispatches clean-expired-search-history', async () => {
      const spy = vi
        .spyOn(processor, 'cleanExpiredSearchHistory')
        .mockResolvedValue({ count: 5 });
      const res = await processor.process({
        name: 'clean-expired-search-history',
      } as any);
      expect(spy).toHaveBeenCalled();
      expect(res).toEqual({ count: 5 });
    });

    it('dispatches clean-expired-accounts', async () => {
      const spy = vi
        .spyOn(processor, 'cleanExpiredAccounts')
        .mockResolvedValue({ queuedCount: 3 });
      const res = await processor.process({
        name: 'clean-expired-accounts',
      } as any);
      expect(spy).toHaveBeenCalled();
      expect(res).toEqual({ queuedCount: 3 });
    });

    it('dispatches hard-delete-user', async () => {
      const spy = vi
        .spyOn(processor, 'hardDeleteUser')
        .mockResolvedValue(undefined);
      await processor.process({
        name: 'hard-delete-user',
        data: { userId: 'u_job' },
      } as any);
      expect(spy).toHaveBeenCalledWith('u_job');
    });

    it('throws UnrecoverableError on unknown job name', async () => {
      await expect(
        processor.process({ name: 'unknown-job' } as any),
      ).rejects.toThrow(
        'Unknown job name in AccountDeletionProcessor: unknown-job',
      );
    });
  });

  describe('cleanExpiredSearchHistory', () => {
    it('purges expired search histories', async () => {
      mockPrisma.searchHistory.deleteMany.mockResolvedValue({ count: 12 });
      const res = await processor.cleanExpiredSearchHistory();
      expect(mockPrisma.searchHistory.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
      expect(res).toEqual({ count: 12 });
    });

    it('rethrows if deleteMany throws error', async () => {
      mockPrisma.searchHistory.deleteMany.mockRejectedValue(
        new Error('DB search error'),
      );
      await expect(processor.cleanExpiredSearchHistory()).rejects.toThrow(
        'DB search error',
      );
    });
  });

  describe('cleanExpiredAccounts', () => {
    it('enqueues hard-delete-user jobs for expired accounts', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'u_exp_1' },
        { id: 'u_exp_2' },
      ]);
      mockQueue.add.mockResolvedValue({ id: 'job_id' });

      const res = await processor.cleanExpiredAccounts();

      expect(mockPrisma.user.findMany).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'hard-delete-user',
        { userId: 'u_exp_1' },
        { jobId: 'delete-u_exp_1' },
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'hard-delete-user',
        { userId: 'u_exp_2' },
        { jobId: 'delete-u_exp_2' },
      );
      expect(res).toEqual({ queuedCount: 2 });
    });

    it('rethrows if user query throws error', async () => {
      mockPrisma.user.findMany.mockRejectedValue(new Error('User find error'));
      await expect(processor.cleanExpiredAccounts()).rejects.toThrow(
        'User find error',
      );
    });
  });
});
