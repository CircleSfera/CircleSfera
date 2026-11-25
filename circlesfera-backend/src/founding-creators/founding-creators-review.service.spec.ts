import { ErrorCode } from '@circlesfera/shared';
import { ForbiddenException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  decidableProfileWhere,
  FoundingCreatorsReviewService,
} from './founding-creators-review.service.js';

describe('FoundingCreatorsReviewService', () => {
  const NOW = new Date('2026-11-25T10:00:00.000Z');
  let prisma: Record<string, any>;
  let service: FoundingCreatorsReviewService;
  const secretKey = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    // Where money is real, as in production.
    process.env.STRIPE_SECRET_KEY = 'sk_live_placeholder';
    prisma = {
      foundingCreatorApplication: {
        findMany: vi.fn().mockResolvedValue([{ id: 'app_1' }]),
        count: vi.fn().mockResolvedValue(1),
        findFirst: vi.fn().mockResolvedValue({
          profileId: 'prof_1',
          profile: { userId: 'u_1' },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ id: 'app_1', status: 'APPROVED' }),
      },
      profile: { count: vi.fn().mockResolvedValue(1) },
      adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
      user: { findUnique: vi.fn().mockResolvedValue({ isTestAccount: false }) },
      $transaction: vi.fn((work: (tx: unknown) => unknown) => work(prisma)),
    };
    service = new FoundingCreatorsReviewService(
      prisma as unknown as PrismaService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    if (secretKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = secretKey;
  });

  it('decides only on Profiles not banned nor suspended, of accounts active and not being deleted', () => {
    expect(decidableProfileWhere(NOW)).toEqual({
      isAccountBanned: false,
      OR: [{ suspendedUntil: null }, { suspendedUntil: { lte: NOW } }],
      user: {
        isActive: true,
        isRootBanned: false,
        deletedAt: null,
        scheduledDeletionAt: null,
      },
    });
  });

  it('lists the applications waiting, oldest first, without those of suspended or closing accounts', async () => {
    const res = await service.queue();

    expect(res).toEqual({ items: [{ id: 'app_1' }], total: 1 });
    const query = prisma.foundingCreatorApplication.findMany.mock.calls[0][0];
    expect(query.where).toEqual({
      status: 'PENDING',
      profile: decidableProfileWhere(NOW),
    });
    expect(prisma.foundingCreatorApplication.count).toHaveBeenCalledWith({
      where: query.where,
    });
    expect(query.orderBy).toEqual({ createdAt: 'asc' });
    // Staff see whether the identity is verified: the year waits for it.
    expect(query.select.profile.select.user).toEqual({
      select: { identityVerifiedAt: true },
    });
  });

  describe('approving', () => {
    it('records the approval and its audit together, and gives nothing by itself: the person starts the year accepting its terms', async () => {
      const res = await service.decide('admin_1', 'app_1', { approve: true });

      expect(prisma.foundingCreatorApplication.updateMany).toHaveBeenCalledWith(
        {
          where: { id: 'app_1', status: 'PENDING' },
          data: {
            status: 'APPROVED',
            decidedAt: NOW,
            decidedById: 'admin_1',
            declineReason: null,
            declineNote: null,
          },
        },
      );
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: {
          adminId: 'admin_1',
          action: 'FOUNDING_CREATOR_APPROVED',
          targetType: 'founding_creator_application',
          targetId: 'app_1',
          details: 'Approved',
        },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(res).toEqual({ id: 'app_1', status: 'APPROVED' });
    });

    it('refuses the approval of a suspended Profile or an account being deleted, with nothing recorded', async () => {
      prisma.profile.count.mockResolvedValue(0);

      await expect(
        service.decide('admin_1', 'app_1', { approve: true }),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.FOUNDING_CREATOR_NOT_FOUND,
      });
      expect(prisma.profile.count).toHaveBeenCalledWith({
        where: { id: 'prof_1', ...decidableProfileWhere(NOW) },
      });
      expect(
        prisma.foundingCreatorApplication.updateMany,
      ).not.toHaveBeenCalled();
      expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
    });

    it('never approves a Test Account where money is real: nothing is recorded', async () => {
      prisma.user.findUnique.mockResolvedValue({ isTestAccount: true });

      await expect(
        service.decide('admin_1', 'app_1', { approve: true }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(
        prisma.foundingCreatorApplication.updateMany,
      ).not.toHaveBeenCalled();
      expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('declining', () => {
    it('records the reason and the note the person reads, audited, also for an account not open to approval', async () => {
      prisma.profile.count.mockResolvedValue(0);
      await service.decide('admin_1', 'app_1', {
        approve: false,
        reason: 'NOT_VIDEO_WORK',
        note: 'Show us edits of your own.',
      });

      expect(prisma.foundingCreatorApplication.updateMany).toHaveBeenCalledWith(
        {
          where: { id: 'app_1', status: 'PENDING' },
          data: {
            status: 'DECLINED',
            decidedAt: NOW,
            decidedById: 'admin_1',
            declineReason: 'NOT_VIDEO_WORK',
            declineNote: 'Show us edits of your own.',
          },
        },
      );
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'FOUNDING_CREATOR_DECLINED',
          details: 'Declined: NOT_VIDEO_WORK',
        }),
      });
      // A Test Account may be declined.
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('gives "other" as the reason when none is named, and no empty note', async () => {
      await service.decide('admin_1', 'app_1', { approve: false, note: '' });

      expect(prisma.foundingCreatorApplication.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            declineReason: 'OTHER',
            declineNote: null,
          }),
        }),
      );
    });
  });

  it('decides only an application waiting: one decided, or decided meanwhile, is refused', async () => {
    prisma.foundingCreatorApplication.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.decide('admin_1', 'app_1', { approve: true }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.FOUNDING_CREATOR_NOT_FOUND,
    });

    prisma.foundingCreatorApplication.updateMany.mockResolvedValueOnce({
      count: 0,
    });
    await expect(
      service.decide('admin_1', 'app_1', { approve: true }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.FOUNDING_CREATOR_NOT_FOUND,
    });
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });
});
