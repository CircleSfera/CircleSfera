import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminAction, NotificationType } from '@prisma/client';
import { NotificationsService } from '../../../../notifications/notifications.service.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { resolveAdminNotificationSenderId } from '../../../utils/resolve-admin-notification-sender.js';
import { LogAdminActionUseCase } from './log-admin-action.use-case.js';

// The step before ending a broadcast: its host is told what is wrong and
// can correct it. It is a notice, not a strike, and has no consequence.
@Injectable()
export class WarnLiveHostUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService,
    @Inject(LogAdminActionUseCase)
    private readonly logAdminAction: LogAdminActionUseCase,
  ) {}

  async execute(adminId: string, streamId: string, reason: string) {
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
      select: { id: true, hostId: true, status: true },
    });
    if (!stream) throw new NotFoundException('Live stream not found');
    if (stream.status !== 'LIVE') {
      throw new BadRequestException('The broadcast is not on air');
    }

    await this.logAdminAction.execute(
      adminId,
      AdminAction.ACCOUNT_WARNED,
      'live_stream',
      streamId,
      reason,
    );
    await this.notificationsService.create({
      recipientId: stream.hostId,
      senderId: await resolveAdminNotificationSenderId(this.prisma, adminId),
      type: NotificationType.MODERATION,
      notice: { key: 'live_host_warned', reason },
    });

    return { success: true };
  }
}
