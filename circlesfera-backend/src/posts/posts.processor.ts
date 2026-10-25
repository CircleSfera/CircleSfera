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
    const { authorProfileId, mediaUrls } = data ?? {};
    if (!mediaUrls || !Array.isArray(mediaUrls)) {
      throw new UnrecoverableError(
        'Invalid mediaUrls payload for delete-post-media',
      );
    }
    if (mediaUrls.length === 0) return;
    // A job queued before files had owners names no author: its files are
    // left to the orphan sweep rather than deleted by address.
    if (!authorProfileId) {
      this.logger.warn(
        `Left ${mediaUrls.length} files of a deleted post: the job names no author.`,
      );
      return;
    }

    this.logger.log(`Deleting the media files of a deleted post...`);
    await this.uploadsService.deleteContentFiles(authorProfileId, mediaUrls);

    this.logger.log(`Successfully deleted all media files.`);
  }
}
