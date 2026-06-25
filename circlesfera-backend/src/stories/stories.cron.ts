import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class StoriesCronService {
  private readonly logger = new Logger(StoriesCronService.name);

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron() {
    this.logger.debug('Running expired stories cleanup cron job');
    const now = new Date();

    try {
      // Delete stories that have expired AND are not saved in any Highlight
      const { count } = await this.prisma.story.deleteMany({
        where: {
          expiresAt: {
            lt: now,
          },
          highlightStories: {
            none: {},
          },
        },
      });

      if (count > 0) {
        this.logger.log(`Cleaned up ${count} expired stories.`);
      }
    } catch (error) {
      this.logger.error('Failed to clean up expired stories', error);
    }
  }
}
