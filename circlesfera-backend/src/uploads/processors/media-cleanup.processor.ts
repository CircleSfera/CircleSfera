import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Job } from 'bullmq';
import {
  getWorkerOptions,
  QUEUE_NAMES,
} from '../../common/constants/queue-policy.constants.js';
import { UploadsService } from '../uploads.service.js';

export interface DeleteMediaBatchJobData {
  mediaUrls: string[];
}

@Injectable()
@Processor(
  QUEUE_NAMES.MEDIA_CLEANUP,
  getWorkerOptions(QUEUE_NAMES.MEDIA_CLEANUP),
)
export class MediaCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaCleanupProcessor.name);

  constructor(
    private readonly uploadsService: UploadsService,
    @Optional()
    @Inject(EventEmitter2)
    private readonly eventEmitter?: EventEmitter2,
  ) {
    super();
  }

  async process(
    job: Job<DeleteMediaBatchJobData, void, string>,
  ): Promise<void> {
    switch (job.name) {
      case 'delete-media-batch':
        return this.handleDeleteBatch(job);
      default:
        this.logger.warn(
          `Unknown job name in media-cleanup queue: ${job.name}`,
        );
    }
  }

  private async handleDeleteBatch(
    job: Job<DeleteMediaBatchJobData, void, string>,
  ): Promise<void> {
    const { mediaUrls } = job.data;
    if (!mediaUrls || mediaUrls.length === 0) {
      this.logger.debug(`No media URLs provided for job ${job.id}`);
      return;
    }

    const maxAttempts = job.opts?.attempts ?? 5;
    const currentAttempt = job.attemptsMade + 1;
    this.logger.log(
      `Processing durable media deletion for ${mediaUrls.length} files (Job ${job.id}, attempt ${currentAttempt}/${maxAttempts})`,
    );

    const failures: Array<{ url: string; error: string }> = [];

    for (const url of mediaUrls) {
      try {
        await this.uploadsService.deleteFile(url);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Failed to delete media file "${url}" on attempt ${currentAttempt}: ${errorMsg}`,
        );
        failures.push({ url, error: errorMsg });
      }
    }

    if (failures.length > 0) {
      const isFinalAttempt = currentAttempt >= maxAttempts;
      const failureSummary = failures
        .map((f) => `${f.url}: ${f.error}`)
        .join('; ');

      if (isFinalAttempt) {
        this.logger.error(
          `Permanent media deletion failure for ${failures.length} files after ${maxAttempts} attempts: ${failureSummary}`,
        );

        if (this.eventEmitter) {
          this.eventEmitter.emit('system.incident', {
            type: 'system.incident',
            payload: {
              message: `Permanent media deletion failure after ${maxAttempts} attempts: ${failureSummary}`,
              path: 'media-cleanup/delete-media-batch',
              statusCode: 500,
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      // Throw error to signal BullMQ to trigger retry with configured exponential backoff
      throw new Error(
        `Media deletion failed for ${failures.length}/${mediaUrls.length} files: ${failureSummary}`,
      );
    }

    this.logger.log(
      `Successfully deleted all ${mediaUrls.length} media files for job ${job.id}`,
    );
  }
}
