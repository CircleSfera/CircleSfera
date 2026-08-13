import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, type Prisma } from '@prisma/client';
import { resolveAdminNotificationSenderId } from '../admin/utils/resolve-admin-notification-sender.js';
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

    const [rows, total] = await Promise.all([
      this.prisma.appeal.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              isActive: true,
              suspendedUntil: true,
              strikeCount: true,
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

    const data = await Promise.all(
      rows.map(async (appeal) => {
        let targetPreview: {
          text?: string | null;
          moderationStatus?: string | null;
          type?: string;
        } | null = null;

        if (appeal.targetType === 'POST_REMOVAL' && appeal.targetId) {
          const post = await this.prisma.post.findUnique({
            where: { id: appeal.targetId },
            select: {
              caption: true,
              moderationStatus: true,
              type: true,
            },
          });
          if (post) {
            targetPreview = {
              text: post.caption?.slice(0, 160) ?? null,
              moderationStatus: post.moderationStatus,
              type: post.type,
            };
          }
        } else if (appeal.targetType === 'ACCOUNT_BAN') {
          targetPreview = {
            text:
              appeal.user?.isActive === false ? 'Account inactive' : 'Account',
            moderationStatus: appeal.user?.suspendedUntil
              ? 'SUSPENDED'
              : appeal.user?.isActive === false
                ? 'BANNED'
                : 'ACTIVE',
            type: 'ACCOUNT',
          };
        }

        return { ...appeal, targetPreview };
      }),
    );

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

  async update(id: string, dto: UpdateAppealDto, adminId: string) {
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
          await tx.user.update({
            where: { id: appeal.userId },
            data: {
              isActive: true,
              suspendedUntil: null,
            } satisfies Prisma.UserUpdateInput,
          });
        }
        if (appeal.targetType === 'POST_REMOVAL' && appeal.targetId) {
          await tx.post.update({
            where: { id: appeal.targetId },
            data: { moderationStatus: 'VISIBLE' },
          });
        }
      }

      return res;
    });

    await this.prisma.adminAuditLog
      .create({
        data: {
          adminId,
          action:
            dto.status === 'APPROVED' ? 'ACCOUNT_RESTORED' : 'REPORT_REVIEWED',
          targetType: 'appeal',
          targetId: appeal.id,
          details: `Appeal ${dto.status}: ${dto.adminNotes || ''}`.trim(),
        },
      })
      .catch((e) => console.error(e));

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

    const senderId = await resolveAdminNotificationSenderId(
      this.prisma,
      adminId,
    );
    await this.notificationsService
      .create({
        recipientId: appeal.userId,
        senderId,
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

    return updatedAppeal;
  }
}
