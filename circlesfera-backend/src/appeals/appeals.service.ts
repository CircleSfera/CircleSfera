import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
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
  async findAll() {
    return this.prisma.appeal.findMany({
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
    });
  }

  async findOne(id: string) {
    const appeal = await this.prisma.appeal.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });
    if (!appeal) throw new NotFoundException('Appeal not found');
    return appeal;
  }

  async update(id: string, dto: UpdateAppealDto) {
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
            data: { isActive: true },
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
    const adminSender = await this.prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true },
    });
    if (adminSender) {
      await this.notificationsService
        .create({
          recipientId: appeal.userId,
          senderId: adminSender.id,
          type: NotificationType.MODERATION,
          content: `Your appeal was ${outcomeLabel}.${dto.adminNotes ? ` Notes: ${dto.adminNotes}` : ''}`,
          postId:
            appeal.targetType === 'POST_REMOVAL'
              ? (appeal.targetId ?? undefined)
              : undefined,
        })
        .catch((e) => console.error(e));
    }

    return updatedAppeal;
  }
}
