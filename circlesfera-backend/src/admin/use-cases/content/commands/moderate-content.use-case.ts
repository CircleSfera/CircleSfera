import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { $Enums, AdminAction } from '@prisma/client';
import { setModerationStatus } from '../../../../common/policies/moderation-decision.js';
import { NotificationsService } from '../../../../notifications/notifications.service.js';
import { removalNotice } from '../../../../notifications/removal-notice.js';
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

    // Removing keeps the row: it is hidden from everyone, its author
    // included, until the six months to appeal are over.
    const result = await setModerationStatus(
      this.prisma,
      targetType,
      targetId,
      status,
      note,
    );
    const authorProfileId = result.profileId;

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
        .create(
          status === 'REMOVED'
            ? removalNotice({
                kind: targetType,
                id: targetId,
                authorProfileId,
                senderId,
                note,
              })
            : {
                recipientId: authorProfileId,
                senderId,
                type: $Enums.NotificationType.MODERATION,
                notice: {
                  key: 'content_moderated',
                  contentType: targetType,
                  status: statusLabel,
                  note,
                },
                postId: targetType === 'POST' ? targetId : undefined,
              },
        )
        .catch((e) => this.logger.error(e));
    }

    return result;
  }
}
