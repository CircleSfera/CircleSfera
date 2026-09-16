import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Job } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadsService } from '../uploads.service.js';
import {
  type DeleteMediaBatchJobData,
  MediaCleanupProcessor,
} from './media-cleanup.processor.js';

describe('MediaCleanupProcessor', () => {
  let processor: MediaCleanupProcessor;
  let mockUploadsService: {
    deleteFile: ReturnType<typeof vi.fn>;
  };
  let mockEventEmitter: {
    emit: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadsService = {
      deleteFile: vi.fn().mockResolvedValue(undefined),
    };
    mockEventEmitter = {
      emit: vi.fn(),
    };

    processor = new MediaCleanupProcessor(
      mockUploadsService as unknown as UploadsService,
      mockEventEmitter as unknown as EventEmitter2,
    );
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should handle empty or null mediaUrls gracefully', async () => {
    const job = {
      id: 'job-1',
      name: 'delete-media-batch',
      data: { mediaUrls: [] },
      opts: { attempts: 5 },
      attemptsMade: 0,
    } as unknown as Job<DeleteMediaBatchJobData, void, string>;

    await processor.process(job);
    expect(mockUploadsService.deleteFile).not.toHaveBeenCalled();
  });

  it('should successfully delete all files in the batch', async () => {
    const job = {
      id: 'job-2',
      name: 'delete-media-batch',
      data: {
        mediaUrls: ['/uploads/file1.png', '/uploads/file2.png'],
      },
      opts: { attempts: 5 },
      attemptsMade: 0,
    } as unknown as Job<DeleteMediaBatchJobData, void, string>;

    await processor.process(job);

    expect(mockUploadsService.deleteFile).toHaveBeenCalledTimes(2);
    expect(mockUploadsService.deleteFile).toHaveBeenCalledWith(
      '/uploads/file1.png',
    );
    expect(mockUploadsService.deleteFile).toHaveBeenCalledWith(
      '/uploads/file2.png',
    );
  });

  it('should throw error on provider failure to trigger BullMQ retry', async () => {
    mockUploadsService.deleteFile.mockRejectedValueOnce(
      new Error('S3 503 Service Unavailable'),
    );

    const job = {
      id: 'job-3',
      name: 'delete-media-batch',
      data: {
        mediaUrls: ['/uploads/failing.jpg'],
      },
      opts: { attempts: 5 },
      attemptsMade: 1,
    } as unknown as Job<DeleteMediaBatchJobData, void, string>;

    await expect(processor.process(job)).rejects.toThrow(
      'Media deletion failed for 1/1 files',
    );
    expect(mockEventEmitter.emit).not.toHaveBeenCalled();
  });

  it('should emit system.incident when failure occurs on final retry attempt', async () => {
    mockUploadsService.deleteFile.mockRejectedValue(
      new Error('Permanent S3 Permission Denied'),
    );

    const job = {
      id: 'job-4',
      name: 'delete-media-batch',
      data: {
        mediaUrls: ['/uploads/failed-permanently.mp4'],
      },
      opts: { attempts: 5 },
      attemptsMade: 4, // 5th attempt (0-indexed 4)
    } as unknown as Job<DeleteMediaBatchJobData, void, string>;

    await expect(processor.process(job)).rejects.toThrow(
      'Media deletion failed for 1/1 files',
    );

    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'system.incident',
      expect.objectContaining({
        type: 'system.incident',
        payload: expect.objectContaining({
          message: expect.stringContaining(
            'Permanent media deletion failure after 5 attempts',
          ),
          path: 'media-cleanup/delete-media-batch',
          statusCode: 500,
        }),
      }),
    );
  });

  it('should ignore unknown job names', async () => {
    const job = {
      id: 'job-unknown',
      name: 'unknown-job',
      data: { mediaUrls: ['/uploads/file.png'] },
      opts: { attempts: 5 },
      attemptsMade: 0,
    } as unknown as Job<DeleteMediaBatchJobData, void, string>;

    await processor.process(job);
    expect(mockUploadsService.deleteFile).not.toHaveBeenCalled();
  });
});
