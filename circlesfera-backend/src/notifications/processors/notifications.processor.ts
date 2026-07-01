import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PushService } from '../../push/push.service.js';

@Processor('notifications-processing')
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PushService) private readonly pushService: PushService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'send-digest-push':
        return this.sendDigestPushNotifications();
      case 'cleanup-old-notifications':
        return this.cleanupOldNotifications();
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  /**
   * Runs every 15 minutes via BullMQ to aggregate and send a single digest
   * push notification to users with recent unread batchable notifications.
   */
  async sendDigestPushNotifications() {
    this.logger.log('Starting digest push notification job...');

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    // Find unread notifications created or updated in the last 15 minutes
    // specific to batchable types (LIKE, COMMENT)
    const recentUnreadNotifications = await this.prisma.notification.findMany({
      where: {
        read: false,
        createdAt: { gte: fifteenMinutesAgo },
        type: { in: ['LIKE', 'COMMENT_LIKE'] },
      },
      select: {
        recipientId: true,
        type: true,
        id: true,
      },
    });

    if (recentUnreadNotifications.length === 0) {
      return;
    }

    // Group by recipientId
    const notificationsByUser = recentUnreadNotifications.reduce(
      (acc, notif) => {
        if (!acc[notif.recipientId]) {
          acc[notif.recipientId] = [];
        }
        acc[notif.recipientId].push(notif);
        return acc;
      },
      {} as Record<string, typeof recentUnreadNotifications>,
    );

    // Send a single digest push per user
    const recipientIds = Object.keys(notificationsByUser);
    for (const recipientId of recipientIds) {
      const count = notificationsByUser[recipientId].length;
      if (count > 0) {
        const bodyText =
          count === 1
            ? 'Tienes 1 nueva notificación sobre tus publicaciones.'
            : `Tienes ${count} nuevas interacciones en tus publicaciones.`;

        await this.pushService
          .sendNotification(recipientId, {
            title: 'Nuevas interacciones',
            body: bodyText,
            data: {
              type: 'DIGEST',
              url: '/activity',
            },
          })
          .catch((err) =>
            this.logger.error(
              `Failed to send digest push to ${recipientId}`,
              err,
            ),
          );
      }
    }

    this.logger.log(
      `Digest push job completed for ${recipientIds.length} users.`,
    );
  }

  /**
   * Runs every day at midnight via BullMQ to clean up old notifications
   * and free up database space.
   */
  async cleanupOldNotifications() {
    this.logger.log('Starting old notifications cleanup job...');

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    try {
      // 1. Delete read notifications older than 30 days
      const readDeleted = await this.prisma.notification.deleteMany({
        where: {
          read: true,
          createdAt: { lt: thirtyDaysAgo },
        },
      });

      // 2. Delete ALL notifications older than 90 days (even if unread)
      const allDeleted = await this.prisma.notification.deleteMany({
        where: {
          createdAt: { lt: ninetyDaysAgo },
        },
      });

      if (readDeleted.count > 0 || allDeleted.count > 0) {
        this.logger.log(
          `Cleaned up ${readDeleted.count} read notifications (>30d) and ${allDeleted.count} old notifications (>90d).`,
        );
      }
    } catch (error) {
      this.logger.error('Failed to clean up old notifications', error);
    }
  }
}
