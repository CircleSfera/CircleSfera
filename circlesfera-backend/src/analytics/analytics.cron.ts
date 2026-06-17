import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AnalyticsCron {
  private readonly logger = new Logger(AnalyticsCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async snapshotUserMetrics() {
    this.logger.log('Starting daily snapshot of UserMetrics...');

    // Batch process users to avoid loading everyone in memory
    const batchSize = 500;
    let skip = 0;
    let hasMore = true;
    let processed = 0;

    while (hasMore) {
      const users = await this.prisma.user.findMany({
        where: { isActive: true },
        select: {
          id: true,
          _count: {
            select: { followers: true, following: true, posts: true },
          },
        },
        take: batchSize,
        skip,
      });

      if (users.length === 0) {
        hasMore = false;
        break;
      }

      const metricsToInsert = users.map((user) => ({
        userId: user.id,
        followersCount: user._count.followers,
        followingCount: user._count.following,
        postsCount: user._count.posts,
      }));

      await this.prisma.userMetric.createMany({
        data: metricsToInsert,
      });

      processed += users.length;
      skip += batchSize;
    }

    this.logger.log(`Completed daily snapshot. Processed ${processed} users.`);
  }
}
