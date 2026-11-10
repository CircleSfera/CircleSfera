import { ErrorCode } from '@circlesfera/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminMonetizationProgrammeService } from './admin-monetization-programme.service.js';

const tx = {
  profile: { updateMany: vi.fn() },
  adminAuditLog: { create: vi.fn() },
};
const prisma = {
  profile: { findMany: vi.fn(), count: vi.fn() },
  $transaction: vi.fn(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (t: typeof tx) => unknown)(tx)
      : Promise.all(arg as unknown[]),
  ),
};
const service = new AdminMonetizationProgrammeService(prisma as never);

describe('AdminMonetizationProgrammeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.profile.updateMany.mockResolvedValue({ count: 1 });
  });

  describe('list', () => {
    it('lists pending applications, oldest first, a page at a time', async () => {
      prisma.profile.findMany.mockResolvedValue([{ id: 'p1' }]);
      prisma.profile.count.mockResolvedValue(41);

      await expect(service.list()).resolves.toEqual({
        items: [{ id: 'p1' }],
        total: 41,
        page: 1,
        totalPages: 3,
      });
      expect(prisma.profile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { monetizationStatus: 'PENDING' },
          orderBy: [{ monetizationAppliedAt: 'asc' }, { id: 'asc' }],
          take: 20,
          skip: 0,
        }),
      );
    });

    it('reads another status and page, and never a page below the first', async () => {
      prisma.profile.findMany.mockResolvedValue([]);
      prisma.profile.count.mockResolvedValue(0);

      await expect(service.list('APPROVED', 2)).resolves.toMatchObject({
        page: 2,
        totalPages: 1,
      });
      expect(prisma.profile.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { monetizationStatus: 'APPROVED' },
          skip: 20,
        }),
      );
      await expect(service.list('APPROVED', 0)).resolves.toMatchObject({
        page: 1,
      });
      await expect(service.list('APPROVED', -3)).resolves.toMatchObject({
        page: 1,
      });
    });
  });

  describe('decide', () => {
    it('approves a pending application and records who and when', async () => {
      await expect(service.decide('admin-1', 'p1', 'approve')).resolves.toEqual(
        { success: true, status: 'APPROVED' },
      );
      expect(tx.profile.updateMany).toHaveBeenCalledWith({
        where: { id: 'p1', monetizationStatus: 'PENDING' },
        data: {
          monetizationStatus: 'APPROVED',
          monetizationReviewedAt: expect.any(Date),
          monetizationReviewedBy: 'admin-1',
          monetizationNote: null,
        },
      });
      expect(tx.adminAuditLog.create).toHaveBeenCalledWith({
        data: {
          adminId: 'admin-1',
          action: 'MONETIZATION_APPROVED',
          targetType: 'profile',
          targetId: 'p1',
          details: null,
        },
      });
    });

    it('refuses a pending application with the reason shown to the creator', async () => {
      await expect(
        service.decide('admin-1', 'p1', 'reject', '  Too little activity yet '),
      ).resolves.toEqual({ success: true, status: 'REJECTED' });
      expect(tx.profile.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            monetizationStatus: 'REJECTED',
            monetizationNote: 'Too little activity yet',
          }),
        }),
      );
    });

    it('revokes an approval, only from approved', async () => {
      await service.decide('admin-1', 'p1', 'revoke', 'Sold adult content');
      expect(tx.profile.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'p1', monetizationStatus: 'APPROVED' },
        }),
      );
      expect(tx.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'MONETIZATION_REVOKED' }),
        }),
      );
    });

    it.each([['reject'], ['revoke']] as const)(
      'needs a reason to %s',
      async (decision) => {
        await expect(
          service.decide('admin-1', 'p1', decision, '   '),
        ).rejects.toMatchObject({ errorCode: ErrorCode.BAD_REQUEST });
        expect(tx.profile.updateMany).not.toHaveBeenCalled();
      },
    );

    it('changes and records nothing when the application is not in the status it starts from', async () => {
      tx.profile.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(
        service.decide('admin-1', 'p1', 'approve'),
      ).rejects.toMatchObject({
        errorCode: ErrorCode.MONETIZATION_REVIEW_NOT_ALLOWED,
      });
      expect(tx.adminAuditLog.create).not.toHaveBeenCalled();
    });
  });
});
