import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminAction,
  NotificationType,
  Prisma,
  ReportStatus,
} from '@prisma/client';
import { NotificationsService } from '../../../../notifications/notifications.service.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { LogAdminActionUseCase } from './log-admin-action.use-case.js';

@Injectable()
export class ReviewReportUseCase {
  private readonly logger = new Logger(ReviewReportUseCase.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService,
    @Inject(LogAdminActionUseCase)
    private readonly logAdminAction: LogAdminActionUseCase,
  ) {}

  async updateStatus(
    adminId: string,
    reportId: string,
    status: ReportStatus,
    internalNotes?: string,
  ) {
    const existing = await this.prisma.report.findUnique({
      where: { id: reportId },
    });
    const data: Prisma.ReportUncheckedUpdateInput = {
      status,
      resolvedAt:
        status === ReportStatus.RESOLVED || status === ReportStatus.REJECTED
          ? new Date()
          : (existing?.resolvedAt ?? undefined),
      assignedToId:
        status === ReportStatus.REVIEWING
          ? adminId
          : (existing?.assignedToId ?? undefined),
      ...(internalNotes !== undefined ? { internalNotes } : {}),
    };
    const result = await this.prisma.report.update({
      where: { id: reportId },
      data,
    });

    let action: AdminAction = AdminAction.REPORT_REVIEWED;
    if (status === ReportStatus.RESOLVED) {
      action = AdminAction.REPORT_RESOLVED;
    } else if (status === ReportStatus.REJECTED) {
      action = AdminAction.REPORT_DISMISSED;
    } else if (status === ReportStatus.REVIEWING) {
      action = AdminAction.REPORT_REVIEWED;
    }
    await this.logAdminAction.execute(adminId, action, 'report', reportId);

    if (existing && existing.status !== status) {
      await this.notificationsService
        .create({
          recipientId: existing.reporterId,
          senderId: adminId,
          type: NotificationType.MODERATION,
          content: `Your report (${existing.targetType}) was updated to ${status}.`,
          postId:
            existing.targetType === 'POST' ? existing.targetId : undefined,
        })
        .catch((e) => this.logger.error(e));
    }

    return result;
  }

  async claim(adminId: string, reportId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException('Report not found');

    const result = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: ReportStatus.REVIEWING,
        assignedToId: adminId,
      },
    });
    await this.logAdminAction.execute(
      adminId,
      AdminAction.REPORT_REVIEWED,
      'report',
      reportId,
      'Claimed for review',
    );
    return result;
  }

  async resolveWithPenalty(
    adminId: string,
    reportId: string,
    penaltyAction: 'IGNORE' | 'STRIKE' | 'BAN',
  ) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) throw new NotFoundException('Report not found');

    let targetUserId: string | null = null;

    if (report.targetType === 'USER') {
      targetUserId = report.targetId;
    } else if (report.targetType === 'POST') {
      const post = await this.prisma.post.findUnique({
        where: { id: report.targetId },
      });
      if (post) targetUserId = post.userId;
    } else if (report.targetType === 'STORY') {
      const story = await this.prisma.story.findUnique({
        where: { id: report.targetId },
      });
      if (story) targetUserId = story.userId;
    } else if (report.targetType === 'COMMENT') {
      const comment = await this.prisma.comment.findUnique({
        where: { id: report.targetId },
      });
      if (comment) targetUserId = comment.userId;
    } else if (report.targetType === 'MESSAGE') {
      const message = await this.prisma.message.findUnique({
        where: { id: report.targetId },
        select: { senderId: true },
      });
      if (message) targetUserId = message.senderId;
    }

    if (penaltyAction === 'STRIKE' && targetUserId) {
      await this.prisma.user.update({
        where: { id: targetUserId },
        data: { strikeCount: { increment: 1 } },
      });
      await this.notificationsService
        .create({
          recipientId: targetUserId,
          senderId: adminId,
          type: NotificationType.MODERATION,
          content:
            'A moderation strike was applied to your account after a report review.',
        })
        .catch((e) => this.logger.error(e));
    } else if (penaltyAction === 'BAN' && targetUserId) {
      await this.prisma.user.update({
        where: { id: targetUserId },
        data: { isActive: false },
      });
      await this.notificationsService
        .create({
          recipientId: targetUserId,
          senderId: adminId,
          type: NotificationType.MODERATION,
          content:
            'Your account was deactivated after a report review. You may appeal from the login screen.',
        })
        .catch((e) => this.logger.error(e));
    } else if (
      penaltyAction === 'IGNORE' &&
      targetUserId &&
      report.targetType === 'USER'
    ) {
      const user = await this.prisma.user.findUnique({
        where: { id: targetUserId },
      });
      if (user && user.strikeCount >= 3) {
        await this.prisma.user.update({
          where: { id: targetUserId },
          data: { strikeCount: { decrement: 1 } },
        });
      }
    }

    await this.logAdminAction.execute(
      adminId,
      AdminAction.REPORT_RESOLVED,
      'REPORT',
      reportId,
      `Resolved with penalty action: ${penaltyAction}`,
    );

    return await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: ReportStatus.RESOLVED,
        resolvedAt: new Date(),
      },
    });
  }

  async bulkUpdate(adminId: string, ids: string[], status: ReportStatus) {
    const uniqueIds = [...new Set(ids)].slice(0, 50);
    if (uniqueIds.length === 0) {
      throw new BadRequestException('ids required');
    }
    if (!['PENDING', 'RESOLVED', 'REJECTED', 'REVIEWING'].includes(status)) {
      throw new BadRequestException('Invalid status');
    }

    const result = await this.prisma.report.updateMany({
      where: { id: { in: uniqueIds } },
      data: { status },
    });

    await this.logAdminAction.execute(
      adminId,
      status === ReportStatus.RESOLVED
        ? AdminAction.REPORT_RESOLVED
        : AdminAction.REPORT_DISMISSED,
      'report',
      'bulk',
      `Bulk updated ${result.count} reports → ${status}`,
    );

    return { updated: result.count };
  }
}
