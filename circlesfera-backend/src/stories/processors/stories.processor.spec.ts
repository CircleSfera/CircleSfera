import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoriesService } from '../stories.service.js';
import { StoriesProcessor } from './stories.processor.js';

describe('StoriesProcessor', () => {
  let processor: StoriesProcessor;
  let mockStoriesService: {
    cleanupExpiredStories: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStoriesService = {
      cleanupExpiredStories: vi.fn().mockResolvedValue({ count: 3 }),
    };

    processor = new StoriesProcessor(
      mockStoriesService as unknown as StoriesService,
    );
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should process cleanup-expired successfully', async () => {
    const job = {
      id: 'job-1',
      name: 'cleanup-expired',
      data: {},
    } as unknown as Job<any, any, string>;

    const result = await processor.process(job);
    expect(mockStoriesService.cleanupExpiredStories).toHaveBeenCalled();
    expect(result).toEqual({ count: 3 });
  });

  it('should throw UnrecoverableError for unknown job name', async () => {
    const job = {
      id: 'job-2',
      name: 'unknown-job',
      data: {},
    } as unknown as Job<any, any, string>;

    await expect(processor.process(job)).rejects.toThrow(UnrecoverableError);
  });
});
