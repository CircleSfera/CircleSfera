import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, type Prisma, Role } from '@prisma/client';
import { EmailService } from '../email/email.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SlackService } from '../slack/slack.service.js';
import { CreateAppealDto } from './dto/create-appeal.dto.js';
import { UpdateAppealDto } from './dto/update-appeal.dto.js';

@Injectable()
export class AppealsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SlackService) private readonly slackService: SlackService,
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService,
    @Inject(EmailService) private readonly emailService: EmailService,
  ) {}

  async create(userId: string, dto: CreateAppealDto) {
    const appeal = await this.prisma.appeal.create({
      data: {
        userId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
      },
    });

    this.slackService
      .sendModerationAlert({
        reportId: appeal.id,
        reporterId: userId,
        targetType: dto.targetType,
        targetId: dto.targetId || 'N/A',
        reason: `New Appeal Created: ${dto.reason}`,
      })
      .catch((e) => console.error(e));

    return appeal;
  }

  async findMyUserAppeals(userId: string) {
    return this.prisma.appeal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Admin Methods
  async findAll(page = 1, limit = 20, status?: string) {
    const skip = (page - 1) * limit;
    const where: { status?: 'PENDING' | 'APPROVED' | 'REJECTED' } = {};
    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      where.status = status as 'PENDING' | 'APPROVED' | 'REJECTED';
    }

    const [data, total] = await Promise.all([
      this.prisma.appeal.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              profile: {
                select: { username: true, fullName: true, avatar: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.appeal.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOne(id: string) {
    const appeal = await this.prisma.appeal.findUnique({
      where: { id },
      include: {
        user: {
          include: { profile: true },
        },
      },
    });
    if (!appeal) throw new NotFoundException('Appeal not found');
    return appeal;
  }

  async update(id: string, dto: UpdateAppealDto, adminId?: string) {
    // Determine if we need to reactivate account or restore post based on approval
    const appeal = await this.findOne(id);

    const updatedAppeal = await this.prisma.$transaction(async (tx) => {
      const res = await tx.appeal.update({
        where: { id },
        data: {
          status: dto.status,
          adminNotes: dto.adminNotes,
        },
      });

      if (dto.status === 'APPROVED') {
        if (appeal.targetType === 'ACCOUNT_BAN') {
          // Restore User Account
          await tx.user.update({
            where: { id: appeal.userId },
            data: {
              isActive: true,
              suspendedUntil: null,
            } satisfies Prisma.UserUpdateInput,
          });
        }
        // If targetType is POST_REMOVAL, restore post
        if (appeal.targetType === 'POST_REMOVAL' && appeal.targetId) {
          await tx.post.update({
            where: { id: appeal.targetId },
            data: { moderationStatus: 'VISIBLE' },
          });
        }
      }

      return res;
    });

    const reviewerId =
      adminId ||
      (
        await this.prisma.user.findFirst({
          where: { role: { in: [Role.ADMIN, Role.MODERATOR] } },
          select: { id: true },
        })
      )?.id;

    if (reviewerId) {
      await this.prisma.adminAuditLog
        .create({
          data: {
            adminId: reviewerId,
            action:
              dto.status === 'APPROVED'
                ? 'ACCOUNT_RESTORED'
                : 'REPORT_REVIEWED',
            targetType: 'appeal',
            targetId: appeal.id,
            details: `Appeal ${dto.status}: ${dto.adminNotes || ''}`.trim(),
          },
        })
        .catch((e) => console.error(e));
    }

    this.slackService
      .sendModerationAlert({
        reportId: appeal.id,
        reporterId: appeal.userId,
        targetType: appeal.targetType,
        targetId: appeal.targetId || 'N/A',
        reason: `Appeal Status Updated: ${dto.status}. Notes: ${dto.adminNotes || 'None'}`,
      })
      .catch((e) => console.error(e));

    const outcomeLabel =
      dto.status === 'APPROVED'
        ? 'approved'
        : dto.status === 'REJECTED'
          ? 'rejected'
          : dto.status.toLowerCase();
    if (reviewerId) {
      await this.notificationsService
        .create({
          recipientId: appeal.userId,
          senderId: reviewerId,
          type: NotificationType.MODERATION,
          content: `Your appeal was ${outcomeLabel}.${dto.adminNotes ? ` Notes: ${dto.adminNotes}` : ''}`,
          postId:
            appeal.targetType === 'POST_REMOVAL'
              ? (appeal.targetId ?? undefined)
              : undefined,
        })
        .catch((e) => console.error(e));

      if (appeal.user?.email) {
        const actionLabel =
          dto.status === 'APPROVED'
            ? 'Restaurado (Apelación Aprobada)'
            : 'Rechazado (Decisión Mantenida)';
        await this.emailService
          .sendModerationEmail(
            appeal.user.email,
            appeal.user.profile?.fullName ||
              appeal.user.profile?.username ||
              'Usuario',
            actionLabel,
            appeal.targetType,
            dto.adminNotes ||
              'Se ha revisado tu apelación según nuestros términos de servicio.',
          )
          .catch((e) => console.error(e));
      }
    }

    return updatedAppeal;
  }
}
