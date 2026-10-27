import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadsService } from '../uploads/uploads.service.js';
import { PostsProcessor } from './posts.processor.js';

describe('PostsProcessor', () => {
  let processor: PostsProcessor;
  let mockUploadsService: {
    deleteFile: ReturnType<typeof vi.fn>;
    releaseContentFiles: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadsService = {
      deleteFile: vi.fn().mockResolvedValue(undefined),
      releaseContentFiles: vi.fn().mockResolvedValue(undefined),
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

  it('keeps the files of a deleted post for 30 days, deleting none, with or without the author named', async () => {
    const urls = ['/uploads/p1.jpg', '/uploads/p2.jpg'];
    await processor.process({
      name: 'delete-post-media',
      data: { authorProfileId: 'author-1', mediaUrls: urls },
    } as unknown as Job);
    await processor.process({
      name: 'delete-post-media',
      data: { mediaUrls: ['/uploads/p3.jpg'] },
    } as unknown as Job);

    expect(mockUploadsService.releaseContentFiles).toHaveBeenNthCalledWith(
      1,
      urls,
    );
    expect(mockUploadsService.releaseContentFiles).toHaveBeenNthCalledWith(2, [
      '/uploads/p3.jpg',
    ]);
    expect(mockUploadsService.deleteFile).not.toHaveBeenCalled();
  });

  it('fails, to be retried, when the files cannot be settled', async () => {
    mockUploadsService.releaseContentFiles.mockRejectedValueOnce(
      new Error('disk busy'),
    );
    const job = {
      name: 'delete-post-media',
      data: { authorProfileId: 'author-1', mediaUrls: ['/uploads/p1.jpg'] },
    } as unknown as Job;

    await expect(processor.process(job)).rejects.toThrow('disk busy');
  });
});
