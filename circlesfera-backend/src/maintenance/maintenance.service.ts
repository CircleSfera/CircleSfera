import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadsService } from '../uploads/uploads.service.js';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadsService: UploadsService,
  ) {}

  /**
   * Cleans up stories that have expired (expiresAt < now).
   * Runs every hour.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredStories() {
    this.logger.log('Starting cleanup of expired stories...');

    try {
      const now = new Date();

      // Find all expired stories
      const expiredStories = await this.prisma.story.findMany({
        where: { expiresAt: { lt: now } },
      });

      if (expiredStories.length === 0) {
        this.logger.log('No expired stories found to clean up.');
        return;
      }

      this.logger.log(
        `Found ${expiredStories.length} expired stories to delete.`,
      );

      // We process them one by one or in batches to handle file deletion
      for (const story of expiredStories) {
        try {
          // Delete physical files
          if (story.url) {
            await this.uploadsService
              .deleteFile(story.url)
              .catch((e) =>
                this.logger.warn(
                  `Failed to delete story media: ${story.url}`,
                  e,
                ),
              );
          }
          if (story.thumbnailUrl) {
            await this.uploadsService
              .deleteFile(story.thumbnailUrl)
              .catch((e) =>
                this.logger.warn(
                  `Failed to delete story thumbnail: ${story.thumbnailUrl}`,
                  e,
                ),
              );
          }

          // Delete DB record
          // (Cascade delete handles StoryView, StoryReaction via Prisma schema if configured)
          await this.prisma.story.delete({
            where: { id: story.id },
          });
        } catch (err) {
          this.logger.error(
            `Failed to process story deletion: ${story.id}`,
            err,
          );
        }
      }

      this.logger.log(
        `Successfully cleaned up ${expiredStories.length} expired stories.`,
      );
    } catch (error) {
      this.logger.error('Error in cleanupExpiredStories cron job', error);
    }
  }

  /**
   * Checks for promotions that have ended and marks them COMPLETED.
   * Runs every 30 minutes.
   */
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

  /**
   * Cleans up search history past expiresAt (GDPR 90-day retention),
   * or older than 90 days when expiresAt was never set.
   * Runs daily at midnight.
   */
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

  /**
   * Purge resolved/rejected reports older than 2 years.
   * Uses resolvedAt when set; otherwise updatedAt for RESOLVED/REJECTED.
   */
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

  /**
   * Purge webhook_events older than 30 days.
   */
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

  /**
   * Lift temporary suspensions whose suspendedUntil has passed.
   */
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

  /**
   * GDPR Hard Delete Worker: Permanently purges accounts whose scheduledDeletionAt has passed.
   * Falls back to deletedAt + 30d for legacy rows without scheduledDeletionAt.
   * Runs daily at midnight.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeGdprDeletedUsers() {
    this.logger.log('Starting GDPR hard delete purge worker...');

    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const usersToPurge = await this.prisma.user.findMany({
        where: {
          OR: [
            { scheduledDeletionAt: { not: null, lte: now } },
            {
              scheduledDeletionAt: null,
              deletedAt: { not: null, lt: thirtyDaysAgo },
            },
          ],
        } satisfies Prisma.UserWhereInput,
        include: { profiles: true },
      });

      if (usersToPurge.length === 0) {
        this.logger.log('No users pending GDPR hard deletion.');
        return;
      }

      this.logger.log(
        `Found ${usersToPurge.length} users for GDPR physical deletion.`,
      );

      for (const user of usersToPurge) {
        try {
          // Physical deletion of media to comply with GDPR
          if (user.profiles[0]) {
            const mediaToDelete = [
              user.profiles[0].avatar,
              user.profiles[0].standardUrl,
              user.profiles[0].thumbnailUrl,
              user.profiles[0].cover,
              user.profiles[0].coverStandardUrl,
            ].filter(Boolean) as string[];

            for (const url of mediaToDelete) {
              await this.uploadsService
                .deleteFile(url)
                .catch((e) =>
                  this.logger.warn(
                    `Failed to delete media ${url} for user ${user.id}`,
                    e,
                  ),
                );
            }
          }

          await this.prisma.user.delete({
            where: { id: user.id },
          });

          this.logger.log(`GDPR Hard Delete completed for user ID: ${user.id}`);
        } catch (err) {
          this.logger.error(`Failed to hard delete user ${user.id}:`, err);
        }
      }
    } catch (error) {
      this.logger.error(
        'Error during GDPR hard delete worker execution:',
        error,
      );
    }
  }

  /**
   * Worker to publish scheduled posts whose scheduledAt <= now.
   * Runs every minute.
   */
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
        await this.prisma.post.update({
          where: { id: p.id },
          data: {
            scheduledStatus: 'PUBLISHED',
            createdAt: now,
          },
        });
      }

      for (const s of scheduledStories) {
        await this.prisma.story.update({
          where: { id: s.id },
          data: {
            scheduledStatus: 'PUBLISHED',
            createdAt: now,
            expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          },
        });
      }
    } catch (error) {
      this.logger.error(
        'Error during scheduled posts publishing worker:',
        error,
      );
    }
  }

  /** Drop stale first-party device signals (180 days without activity). */
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
}
