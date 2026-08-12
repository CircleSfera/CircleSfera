import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  NotificationType,
  type Report,
  type ReportStatus,
} from '@prisma/client';
import type { PaginationDto } from '../common/dto/pagination.dto.js';
import { createPaginatedResult } from '../common/dto/pagination.dto.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlackService } from '../slack/slack.service.js';
import {
  type CreateReportDto,
  ReportTargetType,
} from './dto/create-report.dto.js';

/** Service for content/user reports: creation, listing, and status updates. */
@Injectable()
export class ReportsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SlackService) private readonly slackService: SlackService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * File a new report against a user or content.
   * @param reporterId - The reporting user's ID
   * @param dto - Report details (targetType, targetId, reason, details)
   */
  async create(reporterId: string, dto: CreateReportDto): Promise<Report> {
    switch (dto.targetType) {
      case ReportTargetType.USER: {
        const user = await this.prisma.user.findUnique({
          where: { id: dto.targetId },
        });
        if (!user)
          throw AppException.NotFound(
            ErrorCode.USER_NOT_FOUND,
            'Target user not found',
          );
        break;
      }
      case ReportTargetType.POST: {
        const post = await this.prisma.post.findUnique({
          where: { id: dto.targetId },
        });
        if (!post)
          throw AppException.NotFound(
            ErrorCode.POST_NOT_FOUND,
            'Target post not found',
          );
        break;
      }
      case ReportTargetType.STORY: {
        const story = await this.prisma.story.findUnique({
          where: { id: dto.targetId },
        });
        if (!story)
          throw AppException.NotFound(
            ErrorCode.STORY_NOT_FOUND,
            'Target story not found',
          );
        break;
      }
      case ReportTargetType.COMMENT: {
        const comment = await this.prisma.comment.findUnique({
          where: { id: dto.targetId },
        });
        if (!comment)
          throw AppException.NotFound(
            ErrorCode.COMMENT_NOT_FOUND,
            'Target comment not found',
          );
        break;
      }
      case ReportTargetType.MESSAGE: {
        const message = await this.prisma.message.findUnique({
          where: { id: dto.targetId },
        });
        if (!message)
          throw AppException.NotFound(
            ErrorCode.MESSAGE_NOT_FOUND,
            'Target message not found',
          );
        break;
      }
    }

    const finalDetails = dto.details;

    const report = (await this.prisma.report.create({
      data: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
        details: finalDetails,
      },
    })) as Report;

    this.slackService
      .sendModerationAlert({
        reportId: report.id,
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
        details: finalDetails || undefined,
      })
      .catch((e) => console.error('Failed to send slack moderation alert', e));

    return report;
  }

  /** List reports filed by the authenticated user. */
  async findMyReports(reporterId: string, pagination: PaginationDto) {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
        where: { reporterId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          targetType: true,
          targetId: true,
          reason: true,
          details: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.report.count({ where: { reporterId } }),
    ]);

    return createPaginatedResult(reports, total, page, limit);
  }

  /** List all reports with reporter profiles (admin only). */
  async findAll(pagination: PaginationDto) {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          reporter: {
            include: { profile: true },
          },
        },
      }),
      this.prisma.report.count(),
    ]);

    return createPaginatedResult(reports, total, page, limit);
  }

  /**
   * Update a report's status (e.g. PENDING → RESOLVED).
   */
  async update(
    id: string,
    status: ReportStatus,
    adminId?: string,
  ): Promise<Report> {
    const existing = await this.prisma.report.findUnique({ where: { id } });
    if (!existing) {
      throw AppException.NotFound(
        ErrorCode.REPORT_NOT_FOUND,
        'Report not found',
      );
    }

    const updated = (await this.prisma.report.update({
      where: { id },
      data: { status },
    })) as Report;

    if (existing && existing.status !== status) {
      const senderId =
        adminId ||
        (
          await this.prisma.user.findFirst({
            where: { role: 'ADMIN' },
            select: { id: true },
          })
        )?.id;

      if (senderId) {
        this.eventEmitter.emit('notification.create', {
          recipientId: existing.reporterId,
          senderId,
          type: NotificationType.MODERATION,
          content: `Your report (${existing.targetType}) was updated to ${status}.`,
          postId:
            existing.targetType === 'POST' ? existing.targetId : undefined,
        });
      }
    }

    return updated;
  }
}
