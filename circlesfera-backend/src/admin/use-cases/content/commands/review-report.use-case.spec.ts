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
  };
  let logAdminAction: { execute: ReturnType<typeof vi.fn> };
  let notificationsService: { create: ReturnType<typeof vi.fn> };
  let useCase: ReviewReportUseCase;

  beforeEach(() => {
    prisma = {
      report: {
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      adminIdentity: {
        findUnique: vi.fn().mockResolvedValue({ linkedUserId: null }),
      },
    };
    logAdminAction = { execute: vi.fn().mockResolvedValue(undefined) };
    notificationsService = {
      create: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new ReviewReportUseCase(
      prisma as never,
      notificationsService as never,
      logAdminAction as unknown as LogAdminActionUseCase,
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
});
