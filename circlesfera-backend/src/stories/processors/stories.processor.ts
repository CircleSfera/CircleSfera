import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { StoriesService } from '../stories.service.js';

@Processor('stories-processing')
export class StoriesProcessor extends WorkerHost {
  private readonly logger = new Logger(StoriesProcessor.name);

  constructor(
    @Inject(StoriesService) private readonly storiesService: StoriesService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'cleanup-expired':
        return this.storiesService.cleanupExpiredStories();
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }
}
