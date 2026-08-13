import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminAction, NotificationType, PromotionStatus } from '@prisma/client';
import { RefundPromotionUseCase } from '../../../../creator/use-cases/promotions/commands/refund-promotion.use-case.js';
import { NotificationsService } from '../../../../notifications/notifications.service.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { resolveAdminNotificationSenderId } from '../../../utils/resolve-admin-notification-sender.js';
import { LogAdminActionUseCase } from './log-admin-action.use-case.js';

@Injectable()
export class ReviewPromotionUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService,
    @Inject(LogAdminActionUseCase)
    private readonly logAdminAction: LogAdminActionUseCase,
    @Inject(RefundPromotionUseCase)
    private readonly refundPromotion: RefundPromotionUseCase,
  ) {}

  async execute(
    adminId: string,
    promotionId: string,
    status: PromotionStatus,
    note?: string,
  ) {
    const promo = await this.prisma.promotion.findUnique({
      where: { id: promotionId },
    });

    if (!promo) {
      throw new NotFoundException('Promotion not found');
    }

    if (
      status === PromotionStatus.REJECTED &&
      (promo.status === PromotionStatus.ACTIVE ||
        promo.status === PromotionStatus.PAUSED ||
        Boolean(promo.chargedAt))
    ) {
      try {
        await this.refundPromotion.execute(promotionId, 'admin-reject');
      } catch (err) {
        throw new BadRequestException(
          `Could not refund promotion before reject: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const updated = await this.prisma.promotion.update({
      where: { id: promotionId },
      data: { status: status as PromotionStatus },
    });

    await this.logAdminAction.execute(
      adminId,
      status === PromotionStatus.ACTIVE
        ? AdminAction.UPDATE_USER_STATUS
        : AdminAction.DELETE_POST,
      'promotion',
      promotionId,
      `Status changed to ${status}${note ? `: ${note}` : ''}`,
    );

    const senderId = await resolveAdminNotificationSenderId(
      this.prisma,
      adminId,
    );
    await this.notificationsService.create({
      recipientId: promo.userId,
      senderId,
      type: NotificationType.MODERATION,
      content:
        status === PromotionStatus.ACTIVE
          ? `¡Tu promoción ha sido aprobada! Tu contenido ahora llegará a más personas.`
          : `Tu solicitud de promoción ha sido rechazada.${
              note ? ` Motivo: ${note}` : ''
            }`,
      postId: promo.targetType === 'POST' ? promo.targetId : undefined,
    });

    return updated;
  }
}
