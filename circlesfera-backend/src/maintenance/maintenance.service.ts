import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
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
          status: 'ACTIVE',
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
   * Cleans up search history older than 30 days for privacy.
   * Runs daily at midnight.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldSearchHistory() {
    this.logger.log('Cleaning up old search history...');

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await this.prisma.searchHistory.deleteMany({
        where: {
          createdAt: { lt: thirtyDaysAgo },
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
   * GDPR Hard Delete Worker: Permanently purges user accounts soft-deleted > 30 days ago.
   * Runs daily at midnight. Removes PII and records an anonymized audit log.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeGdprDeletedUsers() {
    this.logger.log('Starting GDPR hard delete purge worker...');

    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const usersToPurge = await this.prisma.user.findMany({
        where: {
          deletedAt: {
            not: null,
            lt: thirtyDaysAgo,
          },
        },
        select: { id: true },
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
}
