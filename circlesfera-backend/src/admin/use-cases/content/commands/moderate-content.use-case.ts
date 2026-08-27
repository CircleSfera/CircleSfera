import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { $Enums, AdminAction } from '@prisma/client';
import { NotificationsService } from '../../../../notifications/notifications.service.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { resolveAdminNotificationSenderId } from '../../../utils/resolve-admin-notification-sender.js';
import { LogAdminActionUseCase } from './log-admin-action.use-case.js';

@Injectable()
export class ModerateContentUseCase {
  private readonly logger = new Logger(ModerateContentUseCase.name);

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

    let result: {
      id: string;
      profileId: string;
      moderationStatus: $Enums.ModerationStatus;
    };
    let authorProfileId: string | undefined;
    if (targetType === 'POST') {
      result = await this.prisma.post.update({
        where: { id: targetId },
        data,
        select: { id: true, profileId: true, moderationStatus: true },
      });
      authorProfileId = result.profileId;
    } else if (targetType === 'STORY') {
      result = await this.prisma.story.update({
        where: { id: targetId },
        data,
        select: { id: true, profileId: true, moderationStatus: true },
      });
      authorProfileId = result.profileId;
    } else {
      result = await this.prisma.comment.update({
        where: { id: targetId },
        data,
        select: { id: true, profileId: true, moderationStatus: true },
      });
      authorProfileId = result.profileId;
    }

    const action =
      status === 'VISIBLE'
        ? ('CONTENT_RESTORED' as AdminAction)
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

    if (authorProfileId) {
      const statusLabel =
        status === 'VISIBLE'
          ? 'restored'
          : status === 'HIDDEN'
            ? 'hidden'
            : 'removed';
      const senderId = await resolveAdminNotificationSenderId(
        this.prisma,
        adminId,
      );
      await this.notificationsService
        .create({
          recipientId: authorProfileId,
          senderId,
          type: $Enums.NotificationType.MODERATION,
          content: `Your ${targetType.toLowerCase()} was ${statusLabel} by moderation.${note ? ` Note: ${note}` : ''} You can appeal from Settings → Appeals.`,
          postId: targetType === 'POST' ? targetId : undefined,
        })
        .catch((e) => this.logger.error(e));
    }

    return result;
  }
}
