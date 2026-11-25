import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { type Job, UnrecoverableError } from 'bullmq';
import { DEFAULT_LOCALE } from '../../common/constants/locale.constants.js';
import {
  getWorkerOptions,
  QUEUE_NAMES,
} from '../../common/constants/queue-policy.constants.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PushService } from '../../push/push.service.js';
import {
  FREE_YEAR_ENDING_NOTICE_JOB,
  type FreeYearEndingNoticeJob,
} from '../free-year-notice.job.js';
import { renderDigest } from '../notice-copy.js';
import { NotificationsService } from '../notifications.service.js';

@Processor(
  QUEUE_NAMES.NOTIFICATIONS_PROCESSING,
  getWorkerOptions(QUEUE_NAMES.NOTIFICATIONS_PROCESSING),
)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PushService) private readonly pushService: PushService,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'send-digest-push':
        return this.sendDigestPushNotifications();
      case 'cleanup-old-notifications':
        return this.cleanupOldNotifications();
      case FREE_YEAR_ENDING_NOTICE_JOB:
        return this.freeYearEndingNotice(
          (job.data as FreeYearEndingNoticeJob).applicationId,
        );
      default:
        throw new UnrecoverableError(
          `Unknown job name in notifications queue: ${job.name}`,
        );
    }
  }

  // The in-app reminder that a founding creator's free year ends (BD-034),
  // written now from the year as it is: a year set to end (cancelled
  // meanwhile, or without VAT) gets the ending text. Nothing when the
  // application, its year or its Profile is gone, or the year is no longer
  // in its free period. A notice that could not be created fails the job,
  // which is tried again under its one id.
  async freeYearEndingNotice(applicationId: string): Promise<void> {
    const application = await this.prisma.foundingCreatorApplication.findUnique(
      {
        where: { id: applicationId },
        select: {
          platformSubscription: {
            select: {
              id: true,
              status: true,
              cancelAtPeriodEnd: true,
              currentPeriodEnd: true,
              periodPriceCents: true,
              profileId: true,
              plan: { select: { priceCents: true, currency: true } },
            },
          },
        },
      },
    );
    const year = application?.platformSubscription;
    if (!year?.profileId || year.status !== 'TRIALING') {
      this.logger.log(
        `Free year notice ${applicationId} skipped: nothing to tell`,
      );
      return;
    }
    const created = await this.notifications.create({
      recipientId: year.profileId,
      type: NotificationType.SYSTEM,
      notice: {
        key: 'free_year_ending',
        endsAt: year.currentPeriodEnd,
        priceCents: year.periodPriceCents ?? year.plan.priceCents,
        currency: year.plan.currency,
        continues: !year.cancelAtPeriodEnd,
      },
      targetType: 'platform_subscription',
      targetId: year.id,
    });
    if (!created) {
      throw new Error(`The free year notice ${applicationId} was not created`);
    }
  }

  // Runs every 15 minutes via BullMQ to aggregate and send a single digest
  // Push notification to users with recent unread batchable notifications.
  async sendDigestPushNotifications() {
    this.logger.log('Starting digest push notification job...');

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    // Find unread notifications created or updated in the last 15 minutes
    // Specific to batchable types (LIKE, COMMENT), excluding un-operational accounts
    const recentUnreadNotifications = await this.prisma.notification.findMany({
      where: {
        read: false,
        createdAt: { gte: fifteenMinutesAgo },
        type: { in: ['LIKE', 'COMMENT_LIKE'] },
        recipient: {
          user: {
            isActive: true,
            isRootBanned: false,
          },
          isAccountBanned: false,
          OR: [
            { suspendedUntil: null },
            { suspendedUntil: { lte: new Date() } },
          ],
        },
      },
      select: {
        recipientId: true,
        senderId: true,
        type: true,
        id: true,
      },
    });

    // As the inbox does, nothing from a Profile blocked either way counts,
    // also when the block came after the notification.
    const blocks = recentUnreadNotifications.length
      ? await this.prisma.block.findMany({
          where: {
            OR: [
              {
                blockerId: {
                  in: [
                    ...new Set(
                      recentUnreadNotifications.map((n) => n.recipientId),
                    ),
                  ],
                },
              },
              {
                blockedId: {
                  in: [
                    ...new Set(
                      recentUnreadNotifications.map((n) => n.recipientId),
                    ),
                  ],
                },
              },
            ],
          },
          select: { blockerId: true, blockedId: true },
        })
      : [];
    const blockedPairs = new Set(
      blocks.flatMap((b) => [
        `${b.blockerId}:${b.blockedId}`,
        `${b.blockedId}:${b.blockerId}`,
      ]),
    );
    const shown = recentUnreadNotifications.filter(
      (n) => !n.senderId || !blockedPairs.has(`${n.recipientId}:${n.senderId}`),
    );

    if (shown.length === 0) {
      return;
    }

    // Group by recipientId
    const notificationsByUser = shown.reduce(
      (acc, notif) => {
        if (!acc[notif.recipientId]) {
          acc[notif.recipientId] = [];
        }
        acc[notif.recipientId].push(notif);
        return acc;
      },
      {} as Record<string, typeof shown>,
    );

    // Send a single digest push per user, in the account's language.
    const recipientIds = Object.keys(notificationsByUser);
    const recipients = await this.prisma.profile.findMany({
      where: { id: { in: recipientIds } },
      select: { id: true, user: { select: { locale: true } } },
    });
    const localeOf = new Map(recipients.map((p) => [p.id, p.user.locale]));
    for (const recipientId of recipientIds) {
      const count = notificationsByUser[recipientId].length;
      if (count > 0) {
        const digest = renderDigest(
          localeOf.get(recipientId) ?? DEFAULT_LOCALE,
          count,
        );

        await this.pushService
          .sendNotification(
            recipientId,
            {
              title: digest.title,
              body: digest.body,
              data: {
                type: 'DIGEST',
                url: '/notifications',
              },
              // The digest gathers likes.
            },
            'likes',
          )
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

  // Runs every day at midnight via BullMQ to clean up old notifications
  // And free up database space.
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
      return { readCount: readDeleted.count, oldCount: allDeleted.count };
    } catch (error) {
      this.logger.error('Failed to clean up old notifications', error);
      throw error;
    }
  }
}
