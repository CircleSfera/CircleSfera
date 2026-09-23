import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REQUIRE_OWNERSHIP_KEY } from '../../auth/decorators/require-ownership.decorator.js';
import { OwnershipGuard } from '../../auth/guards/ownership.guard.js';
import { CommentsService } from '../../comments/comments.service.js';
import { AccountDeletionProcessor } from '../../users/account-deletion.processor.js';
import { UsersService } from '../../users/users.service.js';

describe('Lifecycle, Deletion Races & Authorization Invariants', () => {
  // =========================================================================
  // 1. Account Deletion Scheduling & Grace Period Lifecycle
  // =========================================================================
  describe('Account Deletion Scheduling & Grace Period Lifecycle', () => {
    let usersService: UsersService;
    let mockPrisma: any;
    let mockStripeService: any;
    let mockQueue: any;
    let mockOutbox: any;

    beforeEach(() => {
      mockPrisma = {
        $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
        user: {
          findUnique: vi.fn(),
          update: vi.fn().mockResolvedValue({}),
        },
        refreshToken: {
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      mockStripeService = {
        stripe: {},
      };

      mockQueue = {
        add: vi.fn().mockResolvedValue({ id: 'job-1' }),
        getJob: vi.fn(),
      };

      mockOutbox = {
        enqueue: vi.fn().mockResolvedValue({}),
        triggerImmediatePublish: vi.fn(),
      };

      usersService = new UsersService(
        mockPrisma,
        mockStripeService as any,
        mockQueue,
        mockOutbox as any,
        { emit: vi.fn() } as any,
      );
    });

    it('schedules account deletion with exact 30-day grace period and enqueues delayed job', async () => {
      const now = Date.now();
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-to-schedule',
        email: 'schedule@example.com',
        isActive: true,
        scheduledDeletionAt: null,
      });

      const scheduledDate =
        await usersService.scheduleDeletion('user-to-schedule');

      // Verify scheduled date is roughly 30 days in future
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(scheduledDate.getTime()).toBeGreaterThanOrEqual(
        now + thirtyDaysMs - 1000,
      );

      // Verify user was updated to deactivated with scheduled timestamp
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-to-schedule' },
          data: expect.objectContaining({
            isActive: false,
            deletedAt: expect.any(Date),
            scheduledDeletionAt: scheduledDate,
          }),
        }),
      );

      // Verify Transactional Outbox delayed job was enqueued
      expect(mockOutbox.enqueue).toHaveBeenCalledWith(
        mockPrisma,
        expect.objectContaining({
          queueName: 'users-processing',
          eventName: 'hard-delete-user',
          payload: { userId: 'user-to-schedule' },
          options: expect.objectContaining({
            jobId: 'delete-user-to-schedule',
          }),
        }),
      );
      expect(mockOutbox.triggerImmediatePublish).toHaveBeenCalled();
    });

    it('rejects scheduling deletion if database update fails', async () => {
      mockPrisma.user.update.mockRejectedValue(
        new Error('Record to update not found.'),
      );

      await expect(
        usersService.scheduleDeletion('non-existent-user'),
      ).rejects.toThrow('Record to update not found.');
    });

    it('cancels pending deletion within grace window, restores active state, and removes queued job', async () => {
      const futureDate = new Date(Date.now() + 15 * 86400000); // 15 days remaining
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-restoring',
        email: 'restore@example.com',
        isActive: false,
        deletedAt: new Date(),
        scheduledDeletionAt: futureDate,
      });

      const mockJob = {
        remove: vi.fn().mockResolvedValue(undefined),
      };
      mockQueue.getJob.mockResolvedValue(mockJob);

      const result =
        await usersService.cancelScheduledDeletion('user-restoring');

      expect(result.success).toBe(true);

      // Verify user record restored
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-restoring' },
        data: {
          isActive: true,
          deletedAt: null,
          scheduledDeletionAt: null,
        },
      });

      // Verify queued hard-delete job was removed
      expect(mockQueue.getJob).toHaveBeenCalledWith('delete-user-restoring');
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('rejects cancellation when grace window has already expired', async () => {
      const pastDate = new Date(Date.now() - 10000); // Expired 10s ago
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-expired',
        email: 'expired@example.com',
        isActive: false,
        deletedAt: new Date(Date.now() - 31 * 86400000),
        scheduledDeletionAt: pastDate,
      });

      await expect(
        usersService.cancelScheduledDeletion('user-expired'),
      ).rejects.toThrow('Deletion grace window has expired');

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 2. Hard-Delete Worker Race Condition & Claim Safety
  // =========================================================================
  describe('Hard-Delete Worker Race Protection', () => {
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
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };

      mockUsersService = {
        deleteUser: vi.fn().mockResolvedValue(undefined),
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
        mockPrisma,
        mockUsersService,
        mockStripeService,
        mockEventEmitter,
        mockQueue,
      );
    });

    it('aborts hard delete and protects restored accounts when isActive is true (race protection)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-restored',
        isActive: true, // User logged in or cancelled deletion
        deletedAt: null,
        scheduledDeletionAt: null,
      });

      await processor.hardDeleteUser('user-restored');

      // Must abort without destructive operations
      expect(mockUsersService.deleteScheduledUser).not.toHaveBeenCalled();
      expect(mockUsersService.deleteUser).not.toHaveBeenCalled();
      expect(
        mockStripeService.stripe.subscriptions.list,
      ).not.toHaveBeenCalled();
    });

    it('aborts hard delete when user record has no deletion timestamps', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-cancelled',
        isActive: false,
        deletedAt: null,
        scheduledDeletionAt: null,
      });

      await processor.hardDeleteUser('user-cancelled');

      expect(mockUsersService.deleteScheduledUser).not.toHaveBeenCalled();
      expect(mockUsersService.deleteUser).not.toHaveBeenCalled();
    });

    it('executes atomic deletion when account is legitimately due for hard purge', async () => {
      const pastScheduled = new Date(Date.now() - 5000);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-legit-due',
        isActive: false,
        deletedAt: new Date(Date.now() - 31 * 86400000),
        scheduledDeletionAt: pastScheduled,
        stripeCustomerId: 'cus_legit_999',
        profiles: [{ id: 'profile-due-1' }],
      });

      await processor.hardDeleteUser('user-legit-due');

      // Must execute destructive cascade
      expect(mockUsersService.deleteScheduledUser).toHaveBeenCalledWith(
        'user-legit-due',
      );
      expect(mockEventEmitter.emitAsync).toHaveBeenCalledWith(
        'user.hard_deleted',
        expect.objectContaining({ userId: 'user-legit-due' }),
      );
    });
  });

  // =========================================================================
  // 3. Cross-User Horizontal Authorization (IDOR Prevention)
  // =========================================================================
  describe('Cross-User Horizontal Authorization (IDOR Prevention)', () => {
    let commentsService: CommentsService;
    let mockPrisma: any;
    let mockEventEmitter: any;
    let mockAnalyticsQueue: any;
    let mockAiQueue: any;

    beforeEach(() => {
      mockPrisma = {
        comment: {
          findUnique: vi.fn(),
          delete: vi.fn().mockResolvedValue({ id: 'comm-1' }),
        },
      };

      mockEventEmitter = {
        emit: vi.fn(),
      };

      mockAnalyticsQueue = {
        add: vi.fn().mockResolvedValue({}),
      };

      mockAiQueue = {
        add: vi.fn().mockResolvedValue({}),
      };

      commentsService = new CommentsService(
        mockPrisma,
        mockEventEmitter as any,
        mockAnalyticsQueue as any,
        mockAiQueue as any,
      );
    });

    // Ownership is enforced by OwnershipGuard at the controller level (AUTHZ-002)
    // rather than inside CommentsService — see OwnershipGuard's own IDOR
    // regression coverage in ownership.guard.spec.ts.
    it('blocks User B from deleting User A comment via OwnershipGuard', async () => {
      const guardPrisma = {
        comment: {
          findUnique: vi.fn().mockResolvedValue({ profileId: 'profile-a' }),
        },
      };
      const reflector = new Reflector();
      const guard = new OwnershipGuard(reflector, guardPrisma as any);
      const handler = () => undefined;
      Reflect.defineMetadata(
        REQUIRE_OWNERSHIP_KEY,
        { model: 'Comment' },
        handler,
      );

      const ctx = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { userId: 'user-b', profileId: 'profile-b' },
            params: { id: 'comm-a-1' },
          }),
        }),
        getHandler: () => handler,
        getClass: () => class {},
      } as never;

      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('allows author to delete their own comment successfully', async () => {
      mockPrisma.comment.findUnique.mockResolvedValue({
        id: 'comm-a-1',
        profileId: 'profile-a',
        postId: 'post-1',
        content: 'Original comment',
      });

      await commentsService.remove('comm-a-1');

      expect(mockPrisma.comment.delete).toHaveBeenCalledWith({
        where: { id: 'comm-a-1' },
      });
    });

    it('throws NotFoundException when attempting to delete non-existent comment', async () => {
      mockPrisma.comment.findUnique.mockResolvedValue(null);

      await expect(
        commentsService.remove('non-existent-comment'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
