import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { UploadsService } from '../uploads/uploads.service.js';

@Processor('posts-processing')
export class PostsProcessor extends WorkerHost {
  private readonly logger = new Logger(PostsProcessor.name);

  constructor(private readonly uploadsService: UploadsService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'delete-post-media':
        return this.deletePostMedia(job.data);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async deletePostMedia(data: { mediaUrls: string[] }): Promise<void> {
    const { mediaUrls } = data;
    this.logger.log(`Deleting ${mediaUrls.length} media files for post...`);

    const results = await Promise.allSettled(
      mediaUrls.map((url) => this.uploadsService.deleteFile(url)),
    );

    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      this.logger.warn(`Failed to delete ${failures.length} media files.`);
      // We log but do not throw to avoid infinite retries if a file is already deleted
    } else {
      this.logger.log(`Successfully deleted all media files.`);
    }
  }
}
