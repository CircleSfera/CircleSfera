import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import {
  CASE_RECORD_RETENTION_DAYS,
  FAILED_EXPORT_RETENTION_DAYS,
  PLAINTEXT_IP_RETENTION_DAYS,
  READ_NOTIFICATION_RETENTION_DAYS,
  STRIKE_RECORD_RETENTION_DAYS_AFTER_EXPIRY,
} from '../common/constants/data-retention.constants.js';
import { HelpdeskDataPort } from '../helpdesk/helpdesk-data.port.js';
import { PostDistributionService } from '../posts/services/post-distribution.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StoriesService } from '../stories/stories.service.js';
import { UploadsService } from '../uploads/uploads.service.js';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadsService: UploadsService,
    private readonly stories: StoriesService,
    private readonly postDistribution: PostDistributionService,
    private readonly helpdeskData: HelpdeskDataPort,
  ) {}

  // Cleans up stories that have expired (expiresAt < now), with the same
  // rule as the stories' own job: a story kept in a highlight, or whose
  // countdown is still to be told, stays; files go only if they are the
  // author's own and nothing else uses them.
  // Runs every hour.
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredStories() {
    this.logger.log('Starting cleanup of expired stories...');
    try {
      await this.stories.cleanupExpiredStories();
    } catch (error) {
      this.logger.error('Failed to clean up expired stories', error);
    }
  }

  // Checks for promotions that have ended and marks them COMPLETED.
  // Runs every 30 minutes.
  @Cron(CronExpression.EVERY_30_MINUTES)
  async checkExpiredPromotions() {
    this.logger.log('Checking for expired promotions...');

    try {
      const now = new Date();

      const result = await this.prisma.promotion.updateMany({
        where: {
          status: { in: ['ACTIVE', 'PAUSED'] },
          endDate: { lt: now },
        },
        data: {
          status: 'COMPLETED',
        },
      });

      if (result.count > 0) {
        this.logger.log(
          `Marked ${result.count} expired promotions as COMPLETED.`,
        );
      }
    } catch (error) {
      this.logger.error('Error in checkExpiredPromotions cron job', error);
    }
  }

  // Cleans up search history past expiresAt (GDPR 90-day retention),
  // Or older than 90 days when expiresAt was never set.
  // Runs daily at midnight.
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldSearchHistory() {
    this.logger.log('Cleaning up expired search history...');

    try {
      const now = new Date();
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const result = await this.prisma.searchHistory.deleteMany({
        where: {
          OR: [
            { expiresAt: { not: null, lte: now } },
            { expiresAt: null, createdAt: { lt: ninetyDaysAgo } },
          ],
        },
      });

      if (result.count > 0) {
        this.logger.log(`Deleted ${result.count} old search history records.`);
      }
    } catch (error) {
      this.logger.error('Error in cleanupOldSearchHistory cron job', error);
    }
  }

  // Purge resolved/rejected reports older than 2 years.
  // Uses resolvedAt when set; otherwise updatedAt for RESOLVED/REJECTED.
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeOldResolvedReports() {
    this.logger.log('Purging resolved reports older than 2 years...');

    try {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      const result = await this.prisma.report.deleteMany({
        where: {
          status: { in: ['RESOLVED', 'REJECTED'] },
          OR: [
            { resolvedAt: { not: null, lt: twoYearsAgo } },
            { resolvedAt: null, updatedAt: { lt: twoYearsAgo } },
          ],
        } satisfies Prisma.ReportWhereInput,
      });

      if (result.count > 0) {
        this.logger.log(`Purged ${result.count} old resolved reports.`);
      }
    } catch (error) {
      this.logger.error('Error in purgeOldResolvedReports cron job', error);
    }
  }

  // Purge webhook_events older than 30 days.
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeOldWebhookEvents() {
    this.logger.log('Purging webhook events older than 30 days...');

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await this.prisma.webhookEvent.deleteMany({
        where: {
          createdAt: { lt: thirtyDaysAgo },
        },
      });

      if (result.count > 0) {
        this.logger.log(`Purged ${result.count} old webhook events.`);
      }
    } catch (error) {
      this.logger.error('Error in purgeOldWebhookEvents cron job', error);
    }
  }

  // Lift temporary suspensions whose suspendedUntil has passed.
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async liftExpiredSuspensions() {
    this.logger.log('Lifting expired temporary suspensions...');

    try {
      const now = new Date();
      const expiredProfiles = await this.prisma.profile.findMany({
        where: {
          suspendedUntil: { not: null, lte: now },
          user: {
            isActive: false,
            scheduledDeletionAt: null,
            isRootBanned: false,
          },
        },
        select: { id: true, userId: true },
      });

      if (expiredProfiles.length === 0) {
        return;
      }

      const profileIds = expiredProfiles.map((p) => p.id);
      const userIds = [...new Set(expiredProfiles.map((p) => p.userId))];

      await this.prisma.$transaction([
        this.prisma.profile.updateMany({
          where: { id: { in: profileIds } },
          data: { suspendedUntil: null },
        }),
        this.prisma.user.updateMany({
          where: { id: { in: userIds } },
          data: { isActive: true },
        }),
      ]);

      this.logger.log(
        `Lifted ${userIds.length} expired suspensions (${profileIds.length} profiles).`,
      );
    } catch (error) {
      this.logger.error('Error in liftExpiredSuspensions cron job', error);
    }
  }

  // Video stories whose painted layer is still waiting, ten minutes after
  // they were made, get their join another chance if it was lost, and those
  // whose stream was never asked for get it asked for.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async recoverStoryOverlays() {
    try {
      const now = Date.now();
      const waiting = await this.prisma.story.findMany({
        where: {
          overlayUrl: { not: null },
          createdAt: { lt: new Date(now - 10 * 60 * 1000) },
          expiresAt: { gt: new Date(now) },
        },
        select: { id: true },
        take: 100,
      });
      for (const story of waiting) {
        const outcome = await this.uploadsService.recoverStoryOverlay(story.id);
        if (outcome !== 'left') {
          this.logger.log(`Join of story ${story.id} ${outcome} again`);
        }
      }
      // A video whose stream was never asked for, as when a join was written
      // but its stream could not be queued.
      const streamless = await this.prisma.story.findMany({
        where: {
          mediaType: 'video',
          overlayUrl: null,
          standardUrl: null,
          createdAt: { lt: new Date(now - 10 * 60 * 1000) },
          expiresAt: { gt: new Date(now) },
        },
        select: { id: true, url: true },
        take: 100,
      });
      for (const story of streamless) {
        if (await this.uploadsService.recoverTranscode(story.url)) {
          this.logger.log(`Stream of story ${story.id} asked for again`);
        }
      }
    } catch (error) {
      this.logger.error('Error while recovering story joins:', error);
    }
  }

  // Worker to publish scheduled posts whose scheduledAt <= now.
  // Runs every minute.
  @Cron(CronExpression.EVERY_MINUTE)
  async publishScheduledPosts() {
    try {
      const now = new Date();
      const scheduledPosts = await this.prisma.post.findMany({
        where: {
          scheduledStatus: 'SCHEDULED',
          scheduledAt: { lte: now },
        },
        select: { id: true },
      });

      const scheduledStories = await this.prisma.story.findMany({
        where: {
          scheduledStatus: 'SCHEDULED',
          scheduledAt: { lte: now },
        },
        select: { id: true },
      });

      if (scheduledPosts.length === 0 && scheduledStories.length === 0) return;

      this.logger.log(
        `Publishing ${scheduledPosts.length} scheduled posts and ${scheduledStories.length} scheduled stories...`,
      );

      for (const p of scheduledPosts) {
        // Taken as published first, so two servers never send it out twice.
        const published = await this.prisma.post.updateMany({
          where: { id: p.id, scheduledStatus: 'SCHEDULED' },
          data: {
            scheduledStatus: 'PUBLISHED',
            createdAt: now,
          },
        });
        if (published.count === 0) continue;
        // Feeds, mentions and moderation, as on sharing at once.
        await this.postDistribution
          .dispatchScheduledPostPublished(p.id)
          .catch((e) => this.logger.warn(`Could not send out post ${p.id}`, e));
      }

      for (const s of scheduledStories) {
        // Taken as published first, so two servers never announce it twice.
        const published = await this.prisma.story.updateMany({
          where: { id: s.id, scheduledStatus: 'SCHEDULED' },
          data: {
            scheduledStatus: 'PUBLISHED',
            createdAt: now,
            expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          },
        });
        if (published.count === 0) continue;
        await this.stories
          .announcePublished(s.id)
          .catch((e) =>
            this.logger.warn(`Could not announce story ${s.id}`, e),
          );
      }
    } catch (error) {
      this.logger.error(
        'Error during scheduled posts publishing worker:',
        error,
      );
    }
  }

  // Erase plain-text IP addresses 90 days after they were recorded. The
  // keyed hashes stay for linked-account checks. A last IP with no
  // recording date is older than this rule and is erased too; the next
  // sign-in records it again.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async erasePlaintextIps() {
    const cutoff = new Date(
      Date.now() - PLAINTEXT_IP_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    try {
      const signup = await this.prisma.user.updateMany({
        where: { signupIp: { not: null }, createdAt: { lt: cutoff } },
        data: { signupIp: null },
      });
      const last = await this.prisma.user.updateMany({
        where: {
          lastIp: { not: null },
          OR: [{ lastIpAt: null }, { lastIpAt: { lt: cutoff } }],
        },
        data: { lastIp: null, lastIpAt: null },
      });
      if (signup.count + last.count > 0) {
        this.logger.log(
          `Erased ${signup.count} sign-up and ${last.count} last-access plain-text IPs.`,
        );
      }
    } catch (error) {
      this.logger.error('Error in erasePlaintextIps cron job', error);
    }
  }

  // Delete warning and strike records 12 months after they expire, except
  // those that still cause a ban or suspension in force.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredStrikeRecords() {
    const cutoff = new Date(
      Date.now() -
        STRIKE_RECORD_RETENTION_DAYS_AFTER_EXPIRY * 24 * 60 * 60 * 1000,
    );
    try {
      const causes = await this.prisma.profile.findMany({
        where: {
          OR: [
            { banStrikeId: { not: null } },
            { suspensionStrikeId: { not: null } },
          ],
        },
        select: { banStrikeId: true, suspensionStrikeId: true },
      });
      const keep = causes
        .flatMap((p) => [p.banStrikeId, p.suspensionStrikeId])
        .filter((id): id is string => !!id);
      const result = await this.prisma.profileStrike.deleteMany({
        where: {
          expiresAt: { lt: cutoff },
          ...(keep.length ? { id: { notIn: keep } } : {}),
        },
      });
      if (result.count > 0) {
        this.logger.log(`Purged ${result.count} expired strike records.`);
      }
    } catch (error) {
      this.logger.error('Error in purgeExpiredStrikeRecords cron job', error);
    }
  }

  // Retention of records with no product use after a while: read
  // notifications (90 days), closed support tickets, resolved appeals and
  // the staff audit log (2 years), failed export requests (7 days).
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredRecords() {
    const daysAgo = (days: number) =>
      new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const caseCutoff = daysAgo(CASE_RECORD_RETENTION_DAYS);
    const jobs: Array<[string, () => Promise<{ count: number }>]> = [
      [
        'read notifications',
        () =>
          this.prisma.notification.deleteMany({
            where: {
              read: true,
              createdAt: { lt: daysAgo(READ_NOTIFICATION_RETENTION_DAYS) },
            },
          }),
      ],
      [
        'closed support tickets',
        () => this.helpdeskData.deleteEndedBefore(caseCutoff),
      ],
      [
        'resolved appeals',
        () =>
          this.prisma.appeal.deleteMany({
            where: {
              status: { in: ['APPROVED', 'REJECTED'] },
              OR: [
                { resolvedAt: { lt: caseCutoff } },
                { resolvedAt: null, updatedAt: { lt: caseCutoff } },
              ],
            },
          }),
      ],
      [
        'staff audit log entries',
        () =>
          this.prisma.adminAuditLog.deleteMany({
            where: { createdAt: { lt: caseCutoff } },
          }),
      ],
      [
        'failed export requests',
        () =>
          this.prisma.dataExportRequest.deleteMany({
            where: {
              status: 'FAILED',
              createdAt: { lt: daysAgo(FAILED_EXPORT_RETENTION_DAYS) },
            },
          }),
      ],
    ];
    // Each job runs on its own, so one failure does not stop the others.
    for (const [label, job] of jobs) {
      try {
        const { count } = await job();
        if (count > 0) this.logger.log(`Purged ${count} ${label}.`);
      } catch (error) {
        this.logger.error(`Error purging ${label}`, error);
      }
    }
  }

  // Drop stale first-party device signals (180 days without activity).
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeStaleDeviceSignals() {
    const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    try {
      const result = await this.prisma.deviceSignal.deleteMany({
        where: { lastSeenAt: { lt: cutoff } },
      });
      if (result.count > 0) {
        this.logger.log(`Purged ${result.count} stale device signals.`);
      }
    } catch (error) {
      this.logger.error('Error in purgeStaleDeviceSignals cron job', error);
    }
  }

  // Purge high-volume behavioral interaction events older than 90 days (Responsible Data Handling).
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeOldInteractionEvents() {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    try {
      const result = await this.prisma.interactionEvent.deleteMany({
        where: { createdAt: { lt: ninetyDaysAgo } },
      });
      if (result.count > 0) {
        this.logger.log(
          `Purged ${result.count} interaction events older than 90 days.`,
        );
      }
    } catch (error) {
      this.logger.error('Error in purgeOldInteractionEvents cron job', error);
    }
  }

  // Purge unique post view telemetry records older than 90 days (aggregate counters remain on Post.views).
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeOldPostViews() {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    try {
      const result = await this.prisma.postView.deleteMany({
        where: { createdAt: { lt: ninetyDaysAgo } },
      });
      if (result.count > 0) {
        this.logger.log(
          `Purged ${result.count} post view records older than 90 days.`,
        );
      }
    } catch (error) {
      this.logger.error('Error in purgeOldPostViews cron job', error);
    }
  }

  // Promotion views by person are needed for the day they belong to: they
  // cap how often one person sees a promotion and make them count once. Kept
  // seven days, then purged.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeOldPromotionViews() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    try {
      const result = await this.prisma.promotionView.deleteMany({
        where: { day: { lt: sevenDaysAgo } },
      });
      if (result.count > 0) {
        this.logger.log(
          `Purged ${result.count} promotion view records older than 7 days.`,
        );
      }
    } catch (error) {
      this.logger.error('Error in purgeOldPromotionViews cron job', error);
    }
  }
}
