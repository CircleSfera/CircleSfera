import { ErrorCode } from '@circlesfera/shared';
import { ForbiddenException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/errors/app.exception.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { FoundingCreatorsService } from './founding-creators.service.js';
import { FoundingCreatorsReviewService } from './founding-creators-review.service.js';

describe('FoundingCreatorsReviewService', () => {
  let prisma: Record<string, any>;
  let founders: { startYearOf: ReturnType<typeof vi.fn> };
  let service: FoundingCreatorsReviewService;
  const secretKey = process.env.STRIPE_SECRET_KEY;

  beforeEach(() => {
    // Where money is real, as in production.
    process.env.STRIPE_SECRET_KEY = 'sk_live_placeholder';
    prisma = {
      foundingCreatorApplication: {
        findMany: vi.fn().mockResolvedValue([{ id: 'app_1' }]),
        count: vi.fn().mockResolvedValue(1),
        findFirst: vi.fn().mockResolvedValue({ profile: { userId: 'u_1' } }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ id: 'app_1', status: 'APPROVED' }),
      },
      adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
      user: { findUnique: vi.fn().mockResolvedValue({ isTestAccount: false }) },
      $transaction: vi.fn((work: (tx: unknown) => unknown) => work(prisma)),
    };
    founders = { startYearOf: vi.fn().mockResolvedValue(undefined) };
    service = new FoundingCreatorsReviewService(
      prisma as unknown as PrismaService,
      founders as unknown as FoundingCreatorsService,
    );
  });

  afterEach(() => {
    if (secretKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = secretKey;
  });

  it('lists the applications waiting, oldest first', async () => {
    const res = await service.queue();

    expect(res).toEqual({ items: [{ id: 'app_1' }], total: 1 });
    const query = prisma.foundingCreatorApplication.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ status: 'PENDING' });
    expect(query.orderBy).toEqual({ createdAt: 'asc' });
    // Staff see whether the identity is verified: the year waits for it.
    expect(query.select.profile.select.user).toEqual({
      select: { identityVerifiedAt: true },
    });
  });

  describe('approving', () => {
    it('records the approval and its audit together, then starts the free year', async () => {
      const res = await service.decide('admin_1', 'app_1', { approve: true });

      expect(prisma.foundingCreatorApplication.updateMany).toHaveBeenCalledWith(
        {
          where: { id: 'app_1', status: 'PENDING' },
          data: {
            status: 'APPROVED',
            decidedAt: expect.any(Date),
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
      // The year starts after the decision is committed.
      expect(
        prisma.adminAuditLog.create.mock.invocationCallOrder[0],
      ).toBeLessThan(founders.startYearOf.mock.invocationCallOrder[0]);
      expect(founders.startYearOf).toHaveBeenCalledWith('app_1');
      expect(res).toEqual({
        id: 'app_1',
        status: 'APPROVED',
        freeYearNotStarted: null,
      });
    });

    it('keeps the approval when the year cannot start yet, and says why: the identity, a plan held', async () => {
      founders.startYearOf.mockRejectedValueOnce(
        AppException.Forbidden(ErrorCode.IDENTITY_VERIFICATION_REQUIRED),
      );
      const waiting = await service.decide('admin_1', 'app_1', {
        approve: true,
      });
      expect(waiting.freeYearNotStarted).toBe(
        ErrorCode.IDENTITY_VERIFICATION_REQUIRED,
      );

      founders.startYearOf.mockRejectedValueOnce(
        AppException.Conflict(ErrorCode.ACTIVE_SUBSCRIPTION_EXISTS),
      );
      const holding = await service.decide('admin_1', 'app_1', {
        approve: true,
      });
      expect(holding.freeYearNotStarted).toBe(
        ErrorCode.ACTIVE_SUBSCRIPTION_EXISTS,
      );

      // The Test Account refusal comes as the code in its message.
      founders.startYearOf.mockRejectedValueOnce(
        new ForbiddenException('TEST_ACCOUNT_NO_REAL_MONEY'),
      );
      const test = await service.decide('admin_1', 'app_1', { approve: true });
      expect(test.freeYearNotStarted).toBe('TEST_ACCOUNT_NO_REAL_MONEY');
    });

    it('keeps the approval when the provider fails, which the person can start again', async () => {
      founders.startYearOf.mockRejectedValueOnce(new Error('provider down'));
      const logged = vi
        .spyOn(
          (service as unknown as { logger: { error: () => void } }).logger,
          'error',
        )
        .mockImplementation(() => {});

      const res = await service.decide('admin_1', 'app_1', { approve: true });

      expect(res.freeYearNotStarted).toBe('FAILED');
      expect(logged).toHaveBeenCalled();
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
      expect(founders.startYearOf).not.toHaveBeenCalled();
    });
  });

  describe('declining', () => {
    it('records the reason and the note the person reads, audited, and gives nothing', async () => {
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
            decidedAt: expect.any(Date),
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
      expect(founders.startYearOf).not.toHaveBeenCalled();
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
    expect(founders.startYearOf).not.toHaveBeenCalled();
  });
});
