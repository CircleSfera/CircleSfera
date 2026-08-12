import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { $Enums, AdminAction } from '@prisma/client';
import { NotificationsService } from '../../../../notifications/notifications.service.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { LogAdminActionUseCase } from './log-admin-action.use-case.js';

@Injectable()
export class ModerateContentUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService,
    @Inject(LogAdminActionUseCase)
    private readonly logAdminAction: LogAdminActionUseCase,
  ) {}

  async execute(
    adminId: string,
    targetType: 'POST' | 'STORY' | 'COMMENT',
    targetId: string,
    status: 'VISIBLE' | 'HIDDEN' | 'REMOVED',
    note?: string,
  ) {
    if (!['POST', 'STORY', 'COMMENT'].includes(targetType)) {
      throw new BadRequestException(`Invalid targetType: ${targetType}`);
    }
    if (!['VISIBLE', 'HIDDEN', 'REMOVED'].includes(status)) {
      throw new BadRequestException(`Invalid status: ${status}`);
    }

    const data = {
      moderationStatus: status as $Enums.ModerationStatus,
      moderationNote: note,
    };

    let result: any;
    let authorId: string | undefined;
    if (targetType === 'POST') {
      result = await this.prisma.post.update({
        where: { id: targetId },
        data,
        select: { id: true, userId: true, moderationStatus: true },
      });
      authorId = result.userId;
    } else if (targetType === 'STORY') {
      result = await this.prisma.story.update({
        where: { id: targetId },
        data,
        select: { id: true, userId: true, moderationStatus: true },
      });
      authorId = result.userId;
    } else if (targetType === 'COMMENT') {
      result = await this.prisma.comment.update({
        where: { id: targetId },
        data,
        select: { id: true, userId: true, moderationStatus: true },
      });
      authorId = result.userId;
    }

    const action =
      status === 'VISIBLE'
        ? ('CONTENT_RESTORED' as any as AdminAction)
        : status === 'HIDDEN'
          ? AdminAction.CONTENT_RESTRICTED
          : AdminAction.CONTENT_REMOVED;

    await this.logAdminAction.execute(
      adminId,
      action,
      targetType.toLowerCase(),
      targetId,
      note,
    );

    if (authorId) {
      const statusLabel =
        status === 'VISIBLE'
          ? 'restored'
          : status === 'HIDDEN'
            ? 'hidden'
            : 'removed';
      await this.notificationsService
        .create({
          recipientId: authorId,
          senderId: adminId,
          type: $Enums.NotificationType.MODERATION,
          content: `Your ${targetType.toLowerCase()} was ${statusLabel} by moderation.${note ? ` Note: ${note}` : ''} You can appeal from Settings → Appeals.`,
          postId: targetType === 'POST' ? targetId : undefined,
        })
        .catch((e) => console.error(e));
    }

    return result;
  }
}
