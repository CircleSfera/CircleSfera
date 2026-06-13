import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';

@Processor('analytics-processing')
export class AnalyticsProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'update-performance-score':
        return this.handleUpdatePerformanceScore(job.data);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  /**
   * Updates the performance score of a post based on engagement.
   * Formula: Likes * 2 + Comments * 3 + Views * 0.1
   */
  private async handleUpdatePerformanceScore(data: { postId: string }) {
    const { postId } = data;
    try {
      const post = await this.prisma.post.findUnique({
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
      });

      if (!post) return;

      const score = 
        (post._count.likes * 2) + 
        (post._count.comments * 3) + 
        (post.views * 0.1);

      await this.prisma.post.update({
        where: { id: postId },
        data: { performanceScore: score },
      });

      this.logger.debug(`Updated performanceScore for post ${postId} to ${score}`);
    } catch (error) {
      this.logger.error(`Failed to update performance score for ${postId}`, error);
      throw error;
    }
  }
}
