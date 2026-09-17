import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadsService } from '../uploads/uploads.service.js';
import { PostsProcessor } from './posts.processor.js';

describe('PostsProcessor', () => {
  let processor: PostsProcessor;
  let mockUploadsService: {
    deleteFile: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadsService = {
      deleteFile: vi.fn().mockResolvedValue(undefined),
    };

    processor = new PostsProcessor(
      mockUploadsService as unknown as UploadsService,
    );
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('throws UnrecoverableError for unknown job name', async () => {
    const job = {
      name: 'unknown-job',
      data: {},
    } as unknown as Job;

    await expect(processor.process(job)).rejects.toThrow(UnrecoverableError);
  });

  it('throws UnrecoverableError for missing or invalid mediaUrls payload', async () => {
    const jobNull = {
      name: 'delete-post-media',
      data: null,
    } as unknown as Job;
    await expect(processor.process(jobNull)).rejects.toThrow(
      UnrecoverableError,
    );

    const jobNotArray = {
      name: 'delete-post-media',
      data: { mediaUrls: 'not-an-array' },
    } as unknown as Job;
    await expect(processor.process(jobNotArray)).rejects.toThrow(
      UnrecoverableError,
    );
  });

  it('returns immediately if mediaUrls array is empty', async () => {
    const job = {
      name: 'delete-post-media',
      data: { mediaUrls: [] },
    } as unknown as Job;

    await processor.process(job);
    expect(mockUploadsService.deleteFile).not.toHaveBeenCalled();
  });

  it('successfully deletes media files when all uploadsService calls resolve', async () => {
    const urls = [
      'https://cdn.example.com/p1.jpg',
      'https://cdn.example.com/p2.jpg',
    ];
    const job = {
      name: 'delete-post-media',
      data: { mediaUrls: urls },
    } as unknown as Job;

    await processor.process(job);

    expect(mockUploadsService.deleteFile).toHaveBeenCalledWith(urls[0]);
    expect(mockUploadsService.deleteFile).toHaveBeenCalledWith(urls[1]);
  });

  it('throws Error detailing failures when any deleteFile call rejects', async () => {
    const urls = [
      'https://cdn.example.com/ok.jpg',
      'https://cdn.example.com/fail.jpg',
    ];
    mockUploadsService.deleteFile.mockImplementation((url: string) => {
      if (url.includes('fail')) {
        return Promise.reject(new Error('S3 error'));
      }
      return Promise.resolve();
    });

    const job = {
      name: 'delete-post-media',
      data: { mediaUrls: urls },
    } as unknown as Job;

    await expect(processor.process(job)).rejects.toThrow(
      'Failed to delete 1/2 media files: S3 error',
    );
  });
});
