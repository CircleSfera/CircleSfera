import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import { primaryProfileIdForUser } from '../../../../common/utils/user-profile-shape.util.js';
import type { Notice } from '../../../../notifications/notice-copy.js';
import { NotificationsService } from '../../../../notifications/notifications.service.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { ProfileStrikesService } from '../../../../strikes/profile-strikes.service.js';
import { resolveAdminNotificationSenderId } from '../../../utils/resolve-admin-notification-sender.js';
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
    @Inject(ProfileStrikesService)
    private readonly strikesService: ProfileStrikesService,
  ) {}

  private async notifyModeration(params: {
    adminId: string;
    recipientId: string;
    notice: Notice;
    postId?: string;
  }) {
    const senderId = await resolveAdminNotificationSenderId(
      this.prisma,
      params.adminId,
    );
    await this.notificationsService
      .create({
        recipientId: params.recipientId,
        senderId,
        type: NotificationType.MODERATION,
        notice: params.notice,
        postId: params.postId,
      })
      .catch((e) => this.logger.error(e));
  }

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
          : status === ReportStatus.PENDING
            ? null
            : (existing?.resolvedAt ?? undefined),
      assignedAdminId:
        status === ReportStatus.REVIEWING
          ? adminId
          : status === ReportStatus.PENDING
            ? null
            : (existing?.assignedAdminId ?? undefined),
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
      await this.notifyModeration({
        adminId,
        recipientId: existing.reporterId,
        notice: {
          key: 'report_updated',
          reportType: existing.targetType,
          status,
        },
        postId: existing.targetType === 'POST' ? existing.targetId : undefined,
      });
    }

    return result;
  }

  async claim(adminId: string, reportId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException('Report not found');

    if (
      report.status === ReportStatus.REVIEWING &&
      report.assignedAdminId &&
      report.assignedAdminId !== adminId
    ) {
      throw new ConflictException({
        code: 'REPORT_ALREADY_CLAIMED',
        message: 'Report is already claimed by another admin',
        assignedAdminId: report.assignedAdminId,
      });
    }

    const result = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: ReportStatus.REVIEWING,
        assignedAdminId: adminId,
        resolvedAt: null,
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

  async unclaim(adminId: string, reportId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException('Report not found');

    if (report.assignedAdminId && report.assignedAdminId !== adminId) {
      throw new ForbiddenException({
        code: 'REPORT_CLAIMED_BY_OTHER',
        message: 'Only the assignee can unclaim this report',
        assignedAdminId: report.assignedAdminId,
      });
    }

    const result = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: ReportStatus.PENDING,
        assignedAdminId: null,
        resolvedAt: null,
      },
    });
    await this.logAdminAction.execute(
      adminId,
      AdminAction.REPORT_REVIEWED,
      'report',
      reportId,
      'Unclaimed',
    );
    return result;
  }

  async reassign(adminId: string, reportId: string, toAdminId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException('Report not found');

    const target = await this.prisma.adminIdentity.findUnique({
      where: { id: toAdminId },
      select: { id: true, status: true },
    });
    if (target?.status !== 'ACTIVE') {
      throw new BadRequestException('Target admin identity is not active');
    }

    const result = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: ReportStatus.REVIEWING,
        assignedAdminId: toAdminId,
        resolvedAt: null,
      },
    });
    await this.logAdminAction.execute(
      adminId,
      AdminAction.REPORT_REVIEWED,
      'report',
      reportId,
      `Reassigned to ${toAdminId}`,
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
    let targetProfileId: string | null = null;

    if (report.targetType === 'USER') {
      targetUserId = report.targetId;
      targetProfileId =
        (await primaryProfileIdForUser(this.prisma, report.targetId)) ?? null;
    } else if (report.targetType === 'POST') {
      const post = await this.prisma.post.findUnique({
        where: { id: report.targetId },
        select: { profile: { select: { id: true, userId: true } } },
      });
      if (post) {
        targetUserId = post.profile.userId;
        targetProfileId = post.profile.id;
      }
    } else if (report.targetType === 'STORY') {
      const story = await this.prisma.story.findUnique({
        where: { id: report.targetId },
        select: { profile: { select: { id: true, userId: true } } },
      });
      if (story) {
        targetUserId = story.profile.userId;
        targetProfileId = story.profile.id;
      }
    } else if (report.targetType === 'COMMENT') {
      const comment = await this.prisma.comment.findUnique({
        where: { id: report.targetId },
        select: { profile: { select: { id: true, userId: true } } },
      });
      if (comment) {
        targetUserId = comment.profile.userId;
        targetProfileId = comment.profile.id;
      }
    } else if (report.targetType === 'MESSAGE') {
      const message = await this.prisma.message.findUnique({
        where: { id: report.targetId },
        select: { senderId: true },
      });
      if (message) {
        targetProfileId = message.senderId;
        const senderProfile = await this.prisma.profile.findUnique({
          where: { id: message.senderId },
          select: { userId: true },
        });
        if (senderProfile) targetUserId = senderProfile.userId;
      }
    }

    // Sanctions apply to the Profile that committed the infraction. STRIKE
    // is an upheld minor violation: the strike policy turns it into a
    // warning, a strike, a suspension or a ban. BAN is for severe cases and
    // skips the ladder.
    if (penaltyAction === 'STRIKE' && targetProfileId) {
      await this.strikesService.applyViolation({
        adminId,
        profileId: targetProfileId,
        userId: targetUserId,
        reportId,
        reason: report.reason,
      });
    } else if (penaltyAction === 'BAN' && targetProfileId) {
      await this.strikesService.banProfile({
        adminId,
        userId: targetUserId,
        profileId: targetProfileId,
        reason: 'Violation of the community guidelines after a report review',
      });
    } else if (penaltyAction !== 'IGNORE') {
      this.logger.warn(
        `Report ${reportId}: ${penaltyAction} not applied, target Profile not found`,
      );
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
        assignedAdminId: report.assignedAdminId ?? adminId,
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

    const data: Prisma.ReportUncheckedUpdateManyInput = { status };

    if (status === ReportStatus.RESOLVED || status === ReportStatus.REJECTED) {
      data.resolvedAt = new Date();
    } else if (status === ReportStatus.PENDING) {
      data.resolvedAt = null;
      data.assignedAdminId = null;
    } else if (status === ReportStatus.REVIEWING) {
      data.resolvedAt = null;
      data.assignedAdminId = adminId;
    }

    const result = await this.prisma.report.updateMany({
      where: { id: { in: uniqueIds } },
      data,
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
