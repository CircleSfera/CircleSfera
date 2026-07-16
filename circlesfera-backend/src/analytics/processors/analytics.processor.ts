import { Processor, WorkerHost } from '@nestjs/bullmq';
import { forwardRef, Inject, Logger } from '@nestjs/common';
import { UserEventType } from '@prisma/client';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AnalyticsService } from '../analytics.service.js';

@Processor('analytics-processing')
export class AnalyticsProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AnalyticsService))
    private readonly analyticsService: AnalyticsService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'update-performance-score':
        return this.handleUpdatePerformanceScore(job.data);
      case 'daily-aggregation':
        return this.analyticsService.handleDailyAggregation();
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  /**
   * Updates the performance score of a post based on engagement and telemetry.
   * Formula: Likes*10 + Comments*15 + Bookmarks*12 + Shares*8 + ViewCompletes*5 + DwellTime(sec)*0.5 + Views*0.2
   */
  private async handleUpdatePerformanceScore(data: { postId: string }) {
    const { postId } = data;
    try {
      const [
        post,
        sharesCount,
        viewCompletesCount,
        dwellTimeAggr,
        bookmarksCount,
      ] = await Promise.all([
        this.prisma.post.findUnique({
          where: { id: postId },
          select: {
            views: true,
            _count: {
              select: {
                likes: true,
                comments: true,
              },
            },
          },
        }),
        this.prisma.interactionEvent.count({
          where: { targetId: postId, eventType: UserEventType.SHARE },
        }),
        this.prisma.interactionEvent.count({
          where: { targetId: postId, eventType: UserEventType.VIEW_COMPLETE },
        }),
        this.prisma.interactionEvent.aggregate({
          where: { targetId: postId, eventType: UserEventType.DWELL_TIME },
          _sum: { dwellTime: true },
        }),
        this.prisma.bookmark.count({
          where: { postId },
        }),
      ]);

      if (!post) return;

      const totalDwellTimeSec = (dwellTimeAggr._sum.dwellTime || 0) / 1000;
      const score =
        post._count.likes * 10 +
        post._count.comments * 15 +
        bookmarksCount * 12 +
        sharesCount * 8 +
        viewCompletesCount * 5 +
        totalDwellTimeSec * 0.5 +
        post.views * 0.2;

      await this.prisma.post.update({
        where: { id: postId },
        data: { performanceScore: score },
      });

      this.logger.debug(
        `Updated performanceScore for post ${postId} to ${score}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update performance score for ${postId}`,
        error,
      );
      throw error;
    }
  }
}
