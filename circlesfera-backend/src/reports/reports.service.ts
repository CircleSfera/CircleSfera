import {
  ErrorCode,
  type ModerationReportFiledEvent,
  type NotificationCreateEvent,
} from '@circlesfera/shared';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  NotificationType,
  type Report,
  type ReportStatus,
} from '@prisma/client';
import { isNotice } from '../chat/message-kind.js';
import type { PaginationDto } from '../common/dto/pagination.dto.js';
import { createPaginatedResult } from '../common/dto/pagination.dto.js';
import { AppException } from '../common/errors/app.exception.js';
import { assertCanAccessPost } from '../common/policies/post-access.policy.js';
import { SHOWN_COMMENT_STATUSES } from '../common/policies/removed-content.policy.js';
import { assertCanAccessStory } from '../common/policies/story-access.policy.js';
import { PUBLIC_USER_SELECT } from '../common/selects/public-user.select.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type CreateReportDto,
  ReportTargetType,
} from './dto/create-report.dto.js';

// Marks the notice with where to find help, to send it once a day at most.
const SUPPORT_RESOURCES = 'support_resources';

// Reasons staff see first: someone may hurt themselves, or a child is being
// sexually abused.
const URGENT_REPORT_REASONS: ReadonlySet<string> = new Set([
  'SELF_HARM',
  'CSAM',
]);

// Service for content/user reports: creation, listing, and status updates.
@Injectable()
export class ReportsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // File a new report against a user or content.
  // Param reporterId: The reporting user's ID
  // Param dto: Report details (targetType, targetId, reason, details)
  async create(reporterId: string, dto: CreateReportDto) {
    // The Profile behind what is reported, to offer it help on self-harm.
    let authorProfileId: string | null = null;
    // A report of a Profile is kept against the person behind it.
    let targetId = dto.targetId;
    switch (dto.targetType) {
      case ReportTargetType.USER: {
        // The app names the Profile reported; the person behind it is never
        // shown to it. A person's id is still accepted.
        const reported = await this.prisma.profile.findUnique({
          where: { id: dto.targetId },
          select: { id: true, userId: true },
        });
        if (reported) {
          targetId = reported.userId;
          authorProfileId = reported.id;
          break;
        }
        const user = await this.prisma.user.findUnique({
          where: { id: dto.targetId },
        });
        if (!user)
          throw AppException.NotFound(
            ErrorCode.USER_NOT_FOUND,
            'Target user not found',
          );
        authorProfileId =
          (
            await this.prisma.profile.findFirst({
              where: { userId: user.id },
              orderBy: { createdAt: 'asc' },
              select: { id: true },
            })
          )?.id ?? null;
        break;
      }
      // Content is reported only by someone who can see it; anything else
      // answers as if it did not exist.
      case ReportTargetType.POST: {
        const post = await this.visible(() =>
          assertCanAccessPost(this.prisma, dto.targetId, reporterId),
        );
        if (!post)
          throw AppException.NotFound(
            ErrorCode.POST_NOT_FOUND,
            'Target post not found',
          );
        authorProfileId = post.profileId;
        break;
      }
      case ReportTargetType.STORY: {
        const story = await this.visible(() =>
          assertCanAccessStory(this.prisma, dto.targetId, reporterId),
        );
        if (!story)
          throw AppException.NotFound(
            ErrorCode.STORY_NOT_FOUND,
            'Target story not found',
          );
        authorProfileId = story.profileId;
        break;
      }
      case ReportTargetType.COMMENT: {
        const comment = await this.prisma.comment.findUnique({
          where: { id: dto.targetId },
          select: { profileId: true, postId: true, moderationStatus: true },
        });
        // A comment is seen with its post, and only in a state its post's
        // list shows: one hidden or removed is shown to nobody.
        const seen =
          comment &&
          (SHOWN_COMMENT_STATUSES.in as string[]).includes(
            comment.moderationStatus,
          ) &&
          (await this.visible(() =>
            assertCanAccessPost(this.prisma, comment.postId, reporterId),
          ));
        if (!comment || !seen)
          throw AppException.NotFound(
            ErrorCode.COMMENT_NOT_FOUND,
            'Target comment not found',
          );
        authorProfileId = comment.profileId;
        break;
      }
      case ReportTargetType.MESSAGE: {
        const message = await this.prisma.message.findUnique({
          where: { id: dto.targetId },
        });
        // Only someone who was in the conversation has seen a message: a
        // member now, or one who wrote in it (leaving a group, or being
        // taken out of it, removes the membership but not the messages).
        const inConversation =
          message &&
          ((await this.prisma.participant.findUnique({
            where: {
              conversationId_profileId: {
                conversationId: message.conversationId,
                profileId: reporterId,
              },
            },
            select: { id: true },
          })) ||
            (await this.prisma.message.findFirst({
              where: {
                conversationId: message.conversationId,
                senderId: reporterId,
              },
              select: { id: true },
            })));
        if (!message || !inConversation)
          throw AppException.NotFound(
            ErrorCode.MESSAGE_NOT_FOUND,
            'Target message not found',
          );
        // A notice from the app was written by nobody: its sender is only
        // who it is about.
        if (isNotice(message))
          throw AppException.BadRequest(
            ErrorCode.MESSAGE_IS_NOTICE,
            'A notice cannot be reported',
          );
        authorProfileId = message.senderId;
        break;
      }
      case ReportTargetType.PAYMENT: {
        // A payment is reported by the person who paid it.
        const [payment, reporter] = await Promise.all([
          this.prisma.transaction.findUnique({
            where: { id: dto.targetId },
            select: { senderId: true },
          }),
          this.prisma.profile.findUnique({
            where: { id: reporterId },
            select: { userId: true },
          }),
        ]);
        const party =
          !!payment && !!reporter && payment.senderId === reporter.userId;
        if (!party)
          throw AppException.NotFound(
            ErrorCode.NOT_FOUND,
            'Target payment not found',
          );
        break;
      }
      // A report about the service itself names nothing to check.
      case ReportTargetType.SYSTEM:
        break;
    }

    const finalDetails = dto.details;

    const report = (await this.prisma.report.create({
      data: {
        reporterId,
        targetType: dto.targetType,
        targetId,
        reason: dto.reason,
        details: finalDetails,
        urgent: URGENT_REPORT_REASONS.has(dto.reason),
        ...(dto.reason === 'INTELLECTUAL_PROPERTY'
          ? {
              rightsHolder: dto.rightsHolder,
              workConcerned: dto.workConcerned,
            }
          : {}),
      },
    })) as Report;

    if (dto.reason === 'SELF_HARM' && authorProfileId) {
      await this.offerHelp(authorProfileId, reporterId);
    }

    const event: ModerationReportFiledEvent['payload'] = {
      reportId: report.id,
      reporterId,
      targetType: dto.targetType,
      targetId,
      reason: dto.reason,
      details: finalDetails || undefined,
    };
    this.eventEmitter.emit('moderation.report_filed', event);

    // What the reporter gets back: never the stored target of a report of a
    // Profile, which is the person behind it.
    return {
      id: report.id,
      targetType: report.targetType,
      reason: report.reason,
      status: report.status,
      createdAt: report.createdAt,
    };
  }

  // Runs an access check; whatever it refuses (not found, or private)
  // counts as not found, so a report never tells what exists.
  private async visible<T>(check: () => Promise<T>): Promise<T | null> {
    try {
      return await check();
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      )
        return null;
      throw error;
    }
  }

  // Someone is worried the author may hurt themselves: the author is told
  // privately where to find help, in their language. Never who reported,
  // never more than once a day, and not for a report about oneself.
  private async offerHelp(authorProfileId: string, reporterId: string) {
    if (authorProfileId === reporterId) return;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await this.prisma.notification.findFirst({
      where: {
        recipientId: authorProfileId,
        targetType: SUPPORT_RESOURCES,
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    if (recent) return;
    // From CircleSfera, with no sender.
    this.eventEmitter.emit('notification.create', {
      recipientId: authorProfileId,
      type: NotificationType.SYSTEM,
      notice: { key: 'support_resources' },
      targetType: SUPPORT_RESOURCES,
    } satisfies NotificationCreateEvent['payload']);
  }

  // List reports filed by the authenticated user.
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

    // A report of a Profile is kept against the person behind it, whom the
    // reporter is never told.
    const own = reports.map((r) =>
      r.targetType === ReportTargetType.USER ? { ...r, targetId: null } : r,
    );
    return createPaginatedResult(own, total, page, limit);
  }

  // List all reports with reporter profiles (admin only).
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
            include: { user: { select: PUBLIC_USER_SELECT } },
          },
        },
      }),
      this.prisma.report.count(),
    ]);

    return createPaginatedResult(reports, total, page, limit);
  }

  // Update a report's status (e.g. PENDING → RESOLVED).
  async update(id: string, status: ReportStatus): Promise<Report> {
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

    // From CircleSfera, with no sender; a report CircleSfera filed itself
    // has nobody to tell.
    if (existing && existing.status !== status) {
      if (existing.reporterId) {
        this.eventEmitter.emit('notification.create', {
          recipientId: existing.reporterId,
          type: NotificationType.MODERATION,
          notice: {
            key: 'report_updated',
            reportType: existing.targetType,
            status,
          },
          postId:
            existing.targetType === 'POST' ? existing.targetId : undefined,
        } satisfies NotificationCreateEvent['payload']);
      }
    }

    return updated;
  }
}
