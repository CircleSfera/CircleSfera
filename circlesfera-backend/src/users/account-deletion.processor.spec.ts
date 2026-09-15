import type { Queue } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StripeService } from '../common/stripe/stripe.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AccountDeletionProcessor } from './account-deletion.processor.js';
import type { UsersService } from './users.service.js';

describe('AccountDeletionProcessor (LIFE-001)', () => {
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
      stripe: {
        subscriptions: {
          list: vi.fn().mockResolvedValue({ data: [] }),
          cancel: vi.fn().mockResolvedValue({}),
        },
      },
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

  describe('hardDeleteUser - Stale Job & Race Condition Protection (LIFE-001)', () => {
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
        mockStripeService.stripe.subscriptions.list,
      ).not.toHaveBeenCalled();
      expect(
        mockStripeService.stripe.subscriptions.cancel,
      ).not.toHaveBeenCalled();

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

      mockStripeService.stripe.subscriptions.list.mockResolvedValue({
        data: [{ id: 'sub_abc' }],
      });

      await processor.hardDeleteUser('user-scheduled');

      // Cancels active subscriptions
      expect(mockStripeService.stripe.subscriptions.list).toHaveBeenCalledWith({
        customer: 'cus_scheduled_456',
      });
      expect(
        mockStripeService.stripe.subscriptions.cancel,
      ).toHaveBeenCalledWith('sub_abc');

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
        mockStripeService.stripe.subscriptions.list,
      ).not.toHaveBeenCalled();
      expect(mockEventEmitter.emitAsync).not.toHaveBeenCalled();
      expect(mockUsersService.deleteScheduledUser).not.toHaveBeenCalled();
    });
  });

  describe('LIFE-003 — Cascade Deletion & Explicit Ordering', () => {
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
  });
});
