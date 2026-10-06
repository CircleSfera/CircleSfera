import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ReportStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewReportUseCase } from './review-report.use-case.js';

// Status changes and their notices, claim and reassignment rules, the
// offending Profile for every reported content type, and bulk updates.
// The base spec covers the assignee basics and the three penalty actions.

const adminId = 'admin-1';
const reportId = 'report-1';

function build() {
  const owner = (profileId: string, userId: string) => ({
    profile: { id: profileId, userId },
  });
  const prisma = {
    report: {
      findUnique: vi.fn(),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: reportId,
        ...data,
      })),
      updateMany: vi.fn(),
    },
    adminIdentity: { findUnique: vi.fn().mockResolvedValue(null) },
    profile: { findFirst: vi.fn(), findUnique: vi.fn() },
    post: { findUnique: vi.fn() },
    story: { findUnique: vi.fn() },
    comment: { findUnique: vi.fn() },
    message: { findUnique: vi.fn() },
  };
  const notifications = { create: vi.fn().mockResolvedValue(undefined) };
  const audit = { execute: vi.fn().mockResolvedValue(undefined) };
  const strikes = {
    applyViolation: vi.fn().mockResolvedValue(null),
    banProfile: vi.fn().mockResolvedValue(undefined),
  };
  const useCase = new ReviewReportUseCase(
    prisma as never,
    notifications as never,
    audit as never,
    strikes as never,
  );
  return { useCase, prisma, notifications, audit, strikes, owner };
}

describe('ReviewReportUseCase.updateStatus', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => {
    t = build();
  });

  const existing = (overrides: Record<string, unknown> = {}) => ({
    id: reportId,
    status: ReportStatus.REVIEWING,
    reporterId: 'reporter-1',
    targetType: 'COMMENT',
    targetId: 'comment-1',
    resolvedAt: null,
    assignedAdminId: 'admin-0',
    ...overrides,
  });

  it('resolving stamps the time, keeps the assignee, saves notes and tells the reporter', async () => {
    t.prisma.report.findUnique.mockResolvedValue(existing());

    await t.useCase.updateStatus(
      adminId,
      reportId,
      ReportStatus.RESOLVED,
      'ok',
    );

    expect(t.prisma.report.update).toHaveBeenCalledWith({
      where: { id: reportId },
      data: {
        status: ReportStatus.RESOLVED,
        resolvedAt: expect.any(Date),
        assignedAdminId: 'admin-0',
        internalNotes: 'ok',
      },
    });
    expect(t.audit.execute).toHaveBeenCalledWith(
      adminId,
      'REPORT_RESOLVED',
      'report',
      reportId,
    );
    expect(t.notifications.create).toHaveBeenCalledWith({
      recipientId: 'reporter-1',
      senderId: undefined,
      type: 'MODERATION',
      notice: {
        key: 'report_updated',
        reportType: 'COMMENT',
        status: 'RESOLVED',
      },
      postId: undefined,
    });
  });

  it('rejecting is logged as dismissed', async () => {
    t.prisma.report.findUnique.mockResolvedValue(existing());

    await t.useCase.updateStatus(adminId, reportId, ReportStatus.REJECTED);

    expect(t.audit.execute).toHaveBeenCalledWith(
      adminId,
      'REPORT_DISMISSED',
      'report',
      reportId,
    );
  });

  it('back to pending clears the time and the assignee', async () => {
    t.prisma.report.findUnique.mockResolvedValue(
      existing({ resolvedAt: new Date() }),
    );

    await t.useCase.updateStatus(adminId, reportId, ReportStatus.PENDING);

    expect(t.prisma.report.update).toHaveBeenCalledWith({
      where: { id: reportId },
      data: {
        status: ReportStatus.PENDING,
        resolvedAt: null,
        assignedAdminId: null,
      },
    });
    expect(t.audit.execute).toHaveBeenCalledWith(
      adminId,
      'REPORT_REVIEWED',
      'report',
      reportId,
    );
  });

  it('an unchanged status sends no notice', async () => {
    t.prisma.report.findUnique.mockResolvedValue(existing());

    await t.useCase.updateStatus(adminId, reportId, ReportStatus.REVIEWING);

    expect(t.notifications.create).not.toHaveBeenCalled();
  });

  it('a missing report is updated without notice', async () => {
    t.prisma.report.findUnique.mockResolvedValue(null);

    await t.useCase.updateStatus(adminId, reportId, ReportStatus.REVIEWING);

    expect(t.prisma.report.update).toHaveBeenCalledWith({
      where: { id: reportId },
      data: {
        status: ReportStatus.REVIEWING,
        resolvedAt: undefined,
        assignedAdminId: adminId,
      },
    });
    expect(t.notifications.create).not.toHaveBeenCalled();
  });

  it('a report about a post links the post and a failing notice is only logged', async () => {
    t.prisma.report.findUnique.mockResolvedValue(
      existing({ targetType: 'POST', targetId: 'post-1' }),
    );
    t.notifications.create.mockRejectedValue(new Error('down'));

    await expect(
      t.useCase.updateStatus(adminId, reportId, ReportStatus.RESOLVED),
    ).resolves.toBeDefined();
    expect(t.notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 'post-1' }),
    );
  });
});

describe('ReviewReportUseCase claim, unclaim and reassign', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => {
    t = build();
  });

  it('the assignee may claim again, and an unassigned review can be claimed', async () => {
    t.prisma.report.findUnique.mockResolvedValueOnce({
      status: ReportStatus.REVIEWING,
      assignedAdminId: adminId,
    });
    await expect(t.useCase.claim(adminId, reportId)).resolves.toBeDefined();

    t.prisma.report.findUnique.mockResolvedValueOnce({
      status: ReportStatus.REVIEWING,
      assignedAdminId: null,
    });
    await expect(t.useCase.claim(adminId, reportId)).resolves.toBeDefined();
  });

  it('a claim conflict names the current assignee', async () => {
    t.prisma.report.findUnique.mockResolvedValue({
      status: ReportStatus.REVIEWING,
      assignedAdminId: 'admin-2',
    });

    const error = await t.useCase.claim(adminId, reportId).catch((e) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({
      code: 'REPORT_ALREADY_CLAIMED',
      assignedAdminId: 'admin-2',
    });
  });

  it('unclaim needs an existing report and allows an unassigned one', async () => {
    t.prisma.report.findUnique.mockResolvedValueOnce(null);
    await expect(t.useCase.unclaim(adminId, reportId)).rejects.toThrow(
      NotFoundException,
    );

    t.prisma.report.findUnique.mockResolvedValueOnce({ assignedAdminId: null });
    await t.useCase.unclaim(adminId, reportId);
    expect(t.audit.execute).toHaveBeenCalledWith(
      adminId,
      'REPORT_REVIEWED',
      'report',
      reportId,
      'Unclaimed',
    );
  });

  it('unclaim by someone else names the assignee', async () => {
    t.prisma.report.findUnique.mockResolvedValue({
      assignedAdminId: 'admin-2',
    });

    const error = await t.useCase.unclaim(adminId, reportId).catch((e) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toMatchObject({
      code: 'REPORT_CLAIMED_BY_OTHER',
    });
  });

  it('reassign needs an existing report and an active target admin', async () => {
    t.prisma.report.findUnique.mockResolvedValueOnce(null);
    await expect(
      t.useCase.reassign(adminId, reportId, 'admin-2'),
    ).rejects.toThrow(NotFoundException);

    t.prisma.report.findUnique.mockResolvedValue({ id: reportId });
    t.prisma.adminIdentity.findUnique.mockResolvedValueOnce(null);
    await expect(
      t.useCase.reassign(adminId, reportId, 'ghost'),
    ).rejects.toThrow(BadRequestException);

    t.prisma.adminIdentity.findUnique.mockResolvedValueOnce({
      id: 'admin-3',
      status: 'SUSPENDED',
    });
    await expect(
      t.useCase.reassign(adminId, reportId, 'admin-3'),
    ).rejects.toThrow(BadRequestException);
    expect(t.prisma.report.update).not.toHaveBeenCalled();
  });

  it('reassign hands the review to the target admin', async () => {
    t.prisma.report.findUnique.mockResolvedValue({ id: reportId });
    t.prisma.adminIdentity.findUnique.mockResolvedValue({
      id: 'admin-2',
      status: 'ACTIVE',
    });

    await t.useCase.reassign(adminId, reportId, 'admin-2');

    expect(t.prisma.report.update).toHaveBeenCalledWith({
      where: { id: reportId },
      data: {
        status: ReportStatus.REVIEWING,
        assignedAdminId: 'admin-2',
        resolvedAt: null,
      },
    });
    expect(t.audit.execute).toHaveBeenCalledWith(
      adminId,
      'REPORT_REVIEWED',
      'report',
      reportId,
      'Reassigned to admin-2',
    );
  });
});

describe('ReviewReportUseCase.resolveWithPenalty — offending Profile', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => {
    t = build();
  });

  const report = (targetType: string, assignedAdminId: string | null = null) =>
    t.prisma.report.findUnique.mockResolvedValue({
      id: reportId,
      targetType,
      targetId: 'target-1',
      reason: 'SPAM',
      assignedAdminId,
    });

  it('needs an existing report', async () => {
    t.prisma.report.findUnique.mockResolvedValue(null);
    await expect(
      t.useCase.resolveWithPenalty(adminId, reportId, 'STRIKE'),
    ).rejects.toThrow(NotFoundException);
  });

  it('a reported account is sanctioned on its first Profile', async () => {
    report('USER');
    t.prisma.profile.findFirst.mockResolvedValue({ id: 'p-first' });

    await t.useCase.resolveWithPenalty(adminId, reportId, 'STRIKE');

    expect(t.strikes.applyViolation).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'p-first', userId: 'target-1' }),
    );
  });

  it.each([
    ['STORY', 'story'],
    ['COMMENT', 'comment'],
  ] as const)(
    'a reported %s is sanctioned on its author',
    async (type, model) => {
      report(type);
      t.prisma[model].findUnique.mockResolvedValue(
        t.owner('p-author', 'u-author'),
      );

      await t.useCase.resolveWithPenalty(adminId, reportId, 'BAN');

      expect(t.strikes.banProfile).toHaveBeenCalledWith(
        expect.objectContaining({ profileId: 'p-author', userId: 'u-author' }),
      );
    },
  );

  it('a reported message is sanctioned on its sender', async () => {
    report('MESSAGE');
    t.prisma.message.findUnique.mockResolvedValue({ senderId: 'p-sender' });
    t.prisma.profile.findUnique.mockResolvedValue({ userId: 'u-sender' });

    await t.useCase.resolveWithPenalty(adminId, reportId, 'STRIKE');

    expect(t.strikes.applyViolation).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'p-sender', userId: 'u-sender' }),
    );
  });

  it('a message whose sender Profile is gone is still sanctioned on the Profile id', async () => {
    report('MESSAGE');
    t.prisma.message.findUnique.mockResolvedValue({ senderId: 'p-sender' });
    t.prisma.profile.findUnique.mockResolvedValue(null);

    await t.useCase.resolveWithPenalty(adminId, reportId, 'STRIKE');

    expect(t.strikes.applyViolation).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'p-sender', userId: null }),
    );
  });

  it.each(['POST', 'STORY', 'COMMENT', 'MESSAGE', 'USER'])(
    'deleted %s content: no sanction, but the report is resolved',
    async (type) => {
      report(type, 'admin-0');
      for (const model of ['post', 'story', 'comment', 'message'] as const) {
        t.prisma[model].findUnique.mockResolvedValue(null);
      }
      t.prisma.profile.findFirst.mockResolvedValue(null);

      await t.useCase.resolveWithPenalty(adminId, reportId, 'BAN');

      expect(t.strikes.banProfile).not.toHaveBeenCalled();
      expect(t.prisma.report.update).toHaveBeenCalledWith({
        where: { id: reportId },
        data: {
          status: ReportStatus.RESOLVED,
          resolvedAt: expect.any(Date),
          assignedAdminId: 'admin-0',
        },
      });
    },
  );

  it('an unknown target type applies no sanction', async () => {
    report('LIVE_STREAM');

    await t.useCase.resolveWithPenalty(adminId, reportId, 'STRIKE');

    expect(t.strikes.applyViolation).not.toHaveBeenCalled();
    expect(t.audit.execute).toHaveBeenCalledWith(
      adminId,
      'REPORT_RESOLVED',
      'REPORT',
      reportId,
      'Resolved with penalty action: STRIKE',
    );
  });
});

describe('ReviewReportUseCase.bulkUpdate', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => {
    t = build();
    t.prisma.report.updateMany.mockResolvedValue({ count: 2 });
  });

  it('refuses an empty selection and an unknown status', async () => {
    await expect(
      t.useCase.bulkUpdate(adminId, [], ReportStatus.RESOLVED),
    ).rejects.toThrow(BadRequestException);
    await expect(
      t.useCase.bulkUpdate(adminId, ['a'], 'ARCHIVED' as ReportStatus),
    ).rejects.toThrow(BadRequestException);
    expect(t.prisma.report.updateMany).not.toHaveBeenCalled();
  });

  it('removes duplicates and caps a batch at 50 reports', async () => {
    const ids = ['a', 'a', ...Array.from({ length: 60 }, (_, i) => `r${i}`)];

    await t.useCase.bulkUpdate(adminId, ids, ReportStatus.RESOLVED);

    const where = t.prisma.report.updateMany.mock.calls[0][0].where;
    expect(where.id.in).toHaveLength(50);
    expect(new Set(where.id.in).size).toBe(50);
  });

  it.each([
    [
      ReportStatus.RESOLVED,
      { resolvedAt: expect.any(Date) },
      'REPORT_RESOLVED',
    ],
    [
      ReportStatus.REJECTED,
      { resolvedAt: expect.any(Date) },
      'REPORT_DISMISSED',
    ],
    [
      ReportStatus.PENDING,
      { resolvedAt: null, assignedAdminId: null },
      'REPORT_DISMISSED',
    ],
  ])(
    '%s sets the matching fields and audit action',
    async (status, fields, action) => {
      const result = await t.useCase.bulkUpdate(adminId, ['a', 'b'], status);

      expect(t.prisma.report.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['a', 'b'] } },
        data: { status, ...fields },
      });
      expect(t.audit.execute).toHaveBeenCalledWith(
        adminId,
        action,
        'report',
        'bulk',
        `Bulk updated 2 reports → ${status}`,
      );
      expect(result).toEqual({ updated: 2 });
    },
  );
});
