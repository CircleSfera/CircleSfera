import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import {
  getWorkerOptions,
  QUEUE_NAMES,
} from '../common/constants/queue-policy.constants.js';
import { UploadsService } from '../uploads/uploads.service.js';

@Processor(
  QUEUE_NAMES.POSTS_PROCESSING,
  getWorkerOptions(QUEUE_NAMES.POSTS_PROCESSING),
)
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
        throw new UnrecoverableError(
          `Unknown job name in posts queue: ${job.name}`,
        );
    }
  }

  private async deletePostMedia(data: { mediaUrls: string[] }): Promise<void> {
    const { mediaUrls } = data ?? {};
    if (!mediaUrls || !Array.isArray(mediaUrls)) {
      throw new UnrecoverableError(
        'Invalid mediaUrls payload for delete-post-media',
      );
    }
    if (mediaUrls.length === 0) return;

    this.logger.log(`Deleting ${mediaUrls.length} media files for post...`);

    const results = await Promise.allSettled(
      mediaUrls.map((url) => this.uploadsService.deleteFile(url)),
    );

    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      this.logger.warn(`Failed to delete ${failures.length} media files.`);
      const failureMessages = failures
        .map((f: any) => f.reason?.message ?? String(f.reason))
        .join(', ');
      throw new Error(
        `Failed to delete ${failures.length}/${mediaUrls.length} media files: ${failureMessages}`,
      );
    }

    this.logger.log(`Successfully deleted all media files.`);
  }
}
