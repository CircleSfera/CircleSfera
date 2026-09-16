import * as path from 'node:path';
import { InjectQueue } from '@nestjs/bullmq';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import { OutboxService } from '../outbox/outbox.service.js';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from './interfaces/storage-provider.interface.js';
import type { UploadedFile } from './interfaces/uploaded-file.interface.js';
import { MediaProcessorService } from './media-processor.service.js';
import { MediaSignatureValidator } from './media-signature.validator.js';

export const DEFAULT_MAX_VIDEO_QUEUE_BACKLOG = 20;
export const DEFAULT_MAX_USER_CONCURRENT_VIDEO_JOBS = 2;

export interface TranscodeJobData {
  url: string;
  originalname?: string;
  userId?: string;
}

// Service for file upload and deletion. Delegates to a pluggable StorageProvider.
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    @Inject(STORAGE_PROVIDER)
    private readonly storageProvider: StorageProvider,
    @Inject(MediaProcessorService)
    private readonly mediaProcessor: MediaProcessorService,
    private readonly signatureValidator: MediaSignatureValidator,
    @InjectQueue('video-transcoding') private readonly videoQueue: Queue,
    @Optional() private readonly configService?: ConfigService,
    @Optional()
    @InjectQueue('media-cleanup')
    private readonly mediaCleanupQueue?: Queue,
    @Optional()
    @Inject(OutboxService)
    private readonly outboxService?: OutboxService,
  ) {}

  /**
   * Admission control and account quota verification for video processing.
   * Rejects requests if:
   * 1. Global backlog of waiting + active transcoding jobs reaches saturation limit.
   * 2. Per-user quota of concurrent waiting + active transcoding jobs is exceeded.
   */
  private async assertVideoAdmission(userId?: string): Promise<void> {
    const maxBacklog =
      this.configService?.get<number>('VIDEO_TRANSCODING_MAX_BACKLOG') ??
      DEFAULT_MAX_VIDEO_QUEUE_BACKLOG;
    const maxUserQuota =
      this.configService?.get<number>('VIDEO_TRANSCODING_USER_QUOTA') ??
      DEFAULT_MAX_USER_CONCURRENT_VIDEO_JOBS;

    const [waitingCount, activeCount] = await Promise.all([
      this.videoQueue.getWaitingCount(),
      this.videoQueue.getActiveCount(),
    ]);

    if (waitingCount + activeCount >= maxBacklog) {
      this.logger.warn(
        `Video admission denied: queue backlog saturated (waiting: ${waitingCount}, active: ${activeCount}, max: ${maxBacklog})`,
      );
      throw new ServiceUnavailableException(
        'Video processing capacity is currently saturated. Please try again later.',
      );
    }

    if (userId && typeof this.videoQueue.getJobs === 'function') {
      const activeAndWaitingJobs = await this.videoQueue.getJobs([
        'active',
        'waiting',
      ]);
      const userJobCount = activeAndWaitingJobs.filter(
        (job) => (job.data as TranscodeJobData)?.userId === userId,
      ).length;

      if (userJobCount >= maxUserQuota) {
        this.logger.warn(
          `Video admission denied: user quota exceeded for ${userId} (active/waiting: ${userJobCount}, max: ${maxUserQuota})`,
        );
        throw new HttpException(
          'You have reached the maximum number of concurrent video processing jobs. Please wait for previous videos to finish processing.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  // Upload a file to the configured storage provider.
  // Processes images into multiple optimized variants (original, standard, thumbnail).
  // Param file: The uploaded file data
  // Param userId: The ID of the user requesting the upload (used for video quota enforcement)
  // Returns The public URLs and MIME type of the stored file
  async uploadFile(
    file: UploadedFile,
    userId?: string,
  ): Promise<{
    url: string;
    standardUrl?: string;
    thumbnailUrl?: string;
    type: string;
  }> {
    this.logger.log(
      `Received upload request for: ${file.originalname} (${file.mimetype}) user: ${userId ?? 'anonymous'}`,
    );

    try {
      // Validate file signature before any processing or storage.
      await this.signatureValidator.validate(file.buffer, file.mimetype);

      // Perform video admission control before processing or uploading bytes to storage
      if (file.mimetype.startsWith('video/')) {
        await this.assertVideoAdmission(userId);
      }

      const processed = await this.mediaProcessor.process(file);
      const isImage = file.mimetype.startsWith('image/');

      if (isImage) {
        this.logger.debug(`Uploading 3 image variants...`);
        const [orig, std, thumb] = await Promise.all([
          this.storageProvider.upload({
            ...file,
            buffer: processed.original.buffer,
            mimetype: processed.original.mimetype,
          }),
          this.storageProvider.upload({
            ...file,
            buffer: processed.standard.buffer,
            mimetype: processed.standard.mimetype,
          }),
          this.storageProvider.upload({
            ...file,
            buffer: processed.thumbnail.buffer,
            mimetype: processed.thumbnail.mimetype,
          }),
        ]);

        return {
          url: orig.url,
          standardUrl: std.url,
          thumbnailUrl: thumb.url,
          type: orig.type,
        };
      }

      // Non-images (Video/Audio/Docs)
      this.logger.debug(`File processed, handing off to storage provider...`);
      const result = await this.storageProvider.upload({
        ...file,
        buffer: processed.original.buffer,
        mimetype: processed.original.mimetype,
      });

      if (file.mimetype.startsWith('video/')) {
        const baseName = path.basename(result.url, path.extname(result.url));
        const deterministicJobId = `transcode:${baseName}`;
        this.logger.log(
          `Enqueuing video for HLS transcoding: ${result.url} (user: ${userId ?? 'anonymous'}, jobId: ${deterministicJobId})`,
        );
        await this.videoQueue.add(
          'transcode',
          {
            url: result.url,
            originalname: file.originalname,
            userId,
          },
          {
            jobId: deterministicJobId,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5000,
            },
            removeOnComplete: {
              count: 100,
              age: 24 * 3600,
            },
            removeOnFail: {
              count: 100,
              age: 7 * 24 * 3600,
            },
          },
        );
      }

      return result;
    } catch (error: unknown) {
      this.logger.error(
        `Upload flow failed for ${file.originalname}: ${error instanceof Error ? error.stack : String(error)}`,
      );
      throw error;
    }
  }

  // Delete a file from the storage provider by its URL.
  // Param url: The file URL to delete
  async deleteFile(fileUrl: string): Promise<void> {
    await this.storageProvider.delete(fileUrl);
  }

  /**
   * Schedules durable deletion for a batch of media URLs.
   * - If a Prisma transaction client is provided and OutboxService is available,
   *   the cleanup event is persisted transactionally to the outbox.
   * - Otherwise, if the mediaCleanupQueue is available, it is enqueued directly to BullMQ
   *   with exponential backoff and up to 5 retry attempts.
   * - If neither queue is available, falls back to direct deletion.
   */
  async scheduleMediaDeletion(
    mediaUrls: string[],
    options?: { tx?: Prisma.TransactionClient },
  ): Promise<void> {
    if (!mediaUrls || mediaUrls.length === 0) {
      return;
    }

    const validUrls = Array.from(
      new Set(
        mediaUrls
          .filter(
            (u): u is string => typeof u === 'string' && u.trim().length > 0,
          )
          .map((u) => u.trim()),
      ),
    );

    if (validUrls.length === 0) {
      return;
    }

    // 1. Transactional Outbox path if within transaction
    if (options?.tx && this.outboxService) {
      await this.outboxService.enqueue(options.tx, {
        queueName: 'media-cleanup',
        eventName: 'delete-media-batch',
        payload: { mediaUrls: validUrls },
        options: {
          attempts: 5,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      });
      this.logger.log(
        `Enqueued durable media deletion for ${validUrls.length} files via Outbox transaction.`,
      );
      return;
    }

    // 2. Direct BullMQ queue path
    if (this.mediaCleanupQueue) {
      await this.mediaCleanupQueue.add(
        'delete-media-batch',
        { mediaUrls: validUrls },
        {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: {
            count: 500,
            age: 24 * 3600,
          },
          removeOnFail: {
            count: 1000,
            age: 7 * 24 * 3600,
          },
        },
      );
      this.logger.log(
        `Enqueued durable media deletion for ${validUrls.length} files to BullMQ media-cleanup queue.`,
      );
      return;
    }

    // 3. Fallback when queues are not configured (e.g. lightweight test environments)
    this.logger.debug(
      `Queue not available; deleting ${validUrls.length} media files directly.`,
    );
    for (const url of validUrls) {
      await this.deleteFile(url).catch((err) => {
        this.logger.warn(`Fallback delete failed for ${url}: ${err?.message}`);
      });
    }
  }

  @OnEvent('media.delete_batch', { async: true })
  async handleMediaDeleteBatch(payload: { mediaUrls: string[] }) {
    this.logger.log(
      `Processing media.delete_batch for ${payload.mediaUrls?.length ?? 0} files...`,
    );
    await this.scheduleMediaDeletion(payload.mediaUrls);
  }
}
