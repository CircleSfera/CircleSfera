import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ReportStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LogAdminActionUseCase } from './log-admin-action.use-case.js';
import { ReviewReportUseCase } from './review-report.use-case.js';

describe('ReviewReportUseCase assignee', () => {
  const adminId = 'admin-identity-uuid';
  const otherAdminId = 'other-admin-uuid';
  const reportId = 'report-uuid';

  let prisma: {
    report: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    adminIdentity: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    profile: {
      findFirst: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    post: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    user: {
      update: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
    };
  };
  let logAdminAction: { execute: ReturnType<typeof vi.fn> };
  let notificationsService: { create: ReturnType<typeof vi.fn> };
  let strikesService: {
    applyViolation: ReturnType<typeof vi.fn>;
    banProfile: ReturnType<typeof vi.fn>;
  };
  let useCase: ReviewReportUseCase;

  beforeEach(() => {
    prisma = {
      report: {
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      adminIdentity: {
        findUnique: vi.fn().mockResolvedValue({ linkedUser: null }),
      },
      profile: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      post: {
        findUnique: vi.fn(),
      },
      user: {
        update: vi.fn(),
        findUnique: vi.fn(),
      },
    };
    logAdminAction = { execute: vi.fn().mockResolvedValue(undefined) };
    notificationsService = {
      create: vi.fn().mockResolvedValue(undefined),
    };
    strikesService = {
      applyViolation: vi.fn().mockResolvedValue(null),
      banProfile: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new ReviewReportUseCase(
      prisma as never,
      notificationsService as never,
      logAdminAction as unknown as LogAdminActionUseCase,
      strikesService as never,
    );
  });

  it('claim sets assignedAdminId to AdminIdentity id', async () => {
    prisma.report.findUnique.mockResolvedValue({
      id: reportId,
      status: ReportStatus.PENDING,
      assignedAdminId: null,
    });
    prisma.report.update.mockResolvedValue({
      id: reportId,
      status: ReportStatus.REVIEWING,
      assignedAdminId: adminId,
    });

    const result = await useCase.claim(adminId, reportId);

    expect(prisma.report.update).toHaveBeenCalledWith({
      where: { id: reportId },
      data: {
        status: ReportStatus.REVIEWING,
        assignedAdminId: adminId,
        resolvedAt: null,
      },
    });
    expect(result.assignedAdminId).toBe(adminId);
    expect(logAdminAction.execute).toHaveBeenCalled();
  });

  it('claim throws when report is missing', async () => {
    prisma.report.findUnique.mockResolvedValue(null);
    await expect(useCase.claim(adminId, reportId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('claim conflicts when another admin already owns REVIEWING', async () => {
    prisma.report.findUnique.mockResolvedValue({
      id: reportId,
      status: ReportStatus.REVIEWING,
      assignedAdminId: otherAdminId,
    });
    await expect(useCase.claim(adminId, reportId)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('unclaim clears assignee for owning admin', async () => {
    prisma.report.findUnique.mockResolvedValue({
      id: reportId,
      status: ReportStatus.REVIEWING,
      assignedAdminId: adminId,
    });
    prisma.report.update.mockResolvedValue({
      id: reportId,
      status: ReportStatus.PENDING,
      assignedAdminId: null,
    });

    await useCase.unclaim(adminId, reportId);

    expect(prisma.report.update).toHaveBeenCalledWith({
      where: { id: reportId },
      data: {
        status: ReportStatus.PENDING,
        assignedAdminId: null,
        resolvedAt: null,
      },
    });
  });

  it('unclaim forbids non-assignee', async () => {
    prisma.report.findUnique.mockResolvedValue({
      id: reportId,
      status: ReportStatus.REVIEWING,
      assignedAdminId: otherAdminId,
    });
    await expect(useCase.unclaim(adminId, reportId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('bulk REVIEWING assigns current admin and clears resolvedAt', async () => {
    prisma.report.updateMany.mockResolvedValue({ count: 2 });
    await useCase.bulkUpdate(adminId, ['a', 'b'], ReportStatus.REVIEWING);
    expect(prisma.report.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] } },
      data: {
        status: ReportStatus.REVIEWING,
        resolvedAt: null,
        assignedAdminId: adminId,
      },
    });
  });

  it('updateStatus REVIEWING sets assignedAdminId', async () => {
    prisma.report.findUnique.mockResolvedValue({
      id: reportId,
      status: ReportStatus.PENDING,
      assignedAdminId: null,
      reporterId: 'reporter-uuid',
      targetType: 'POST',
      targetId: 'post-uuid',
    });
    prisma.report.update.mockResolvedValue({
      id: reportId,
      status: ReportStatus.REVIEWING,
      assignedAdminId: adminId,
    });

    await useCase.updateStatus(adminId, reportId, ReportStatus.REVIEWING);

    expect(prisma.report.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ReportStatus.REVIEWING,
          assignedAdminId: adminId,
        }),
      }),
    );
  });

  const reportOnPost = () => {
    prisma.report.findUnique.mockResolvedValue({
      id: reportId,
      targetType: 'POST',
      targetId: 'post-uuid',
      reason: 'HARASSMENT',
    });
    prisma.post.findUnique.mockResolvedValue({
      profile: { id: 'profile-uuid', userId: 'user-uuid' },
    });
    prisma.report.update.mockResolvedValue({
      id: reportId,
      status: ReportStatus.RESOLVED,
    });
  };

  it('STRIKE records the violation against the offending Profile with the report rule', async () => {
    reportOnPost();

    await useCase.resolveWithPenalty(adminId, reportId, 'STRIKE');

    expect(strikesService.applyViolation).toHaveBeenCalledWith({
      adminId,
      profileId: 'profile-uuid',
      userId: 'user-uuid',
      reportId,
      reason: 'HARASSMENT',
    });
    expect(strikesService.banProfile).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.report.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: reportId },
        data: expect.objectContaining({ status: ReportStatus.RESOLVED }),
      }),
    );
  });

  it('BAN bans the offending Profile at once, without the strike ladder', async () => {
    reportOnPost();

    await useCase.resolveWithPenalty(adminId, reportId, 'BAN');

    expect(strikesService.banProfile).toHaveBeenCalledWith({
      adminId,
      userId: 'user-uuid',
      profileId: 'profile-uuid',
      reason: expect.any(String),
    });
    expect(strikesService.applyViolation).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('IGNORE resolves the report without touching any strike', async () => {
    prisma.report.findUnique.mockResolvedValue({
      id: reportId,
      targetType: 'USER',
      targetId: 'user-uuid',
      reason: 'SPAM',
    });
    prisma.profile.findFirst.mockResolvedValue({ id: 'profile-uuid' });
    prisma.report.update.mockResolvedValue({ id: reportId });

    await useCase.resolveWithPenalty(adminId, reportId, 'IGNORE');

    expect(strikesService.applyViolation).not.toHaveBeenCalled();
    expect(strikesService.banProfile).not.toHaveBeenCalled();
    expect(prisma.profile.update).not.toHaveBeenCalled();
  });
});
