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

  private async deletePostMedia(data: {
    authorProfileId?: string;
    mediaUrls: string[];
  }): Promise<void> {
    const { mediaUrls } = data ?? {};
    if (!mediaUrls || !Array.isArray(mediaUrls)) {
      throw new UnrecoverableError(
        'Invalid mediaUrls payload for delete-post-media',
      );
    }
    if (mediaUrls.length === 0) return;
    // The files are kept 30 days, readable by their owner only, then erased
    // by the nightly erasure (PD-040). A job queued before it named its
    // author is settled the same way: the author is not needed.
    await this.uploadsService.releaseContentFiles(mediaUrls);
    this.logger.log(`Settled the media files of a deleted post.`);
  }
}
