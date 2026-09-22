import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditsService } from '../edits.service.js';
import { EditsProcessor } from './edits.processor.js';

describe('EditsProcessor', () => {
  let processor: EditsProcessor;
  let mockEditsService: {
    cleanupAbandonedDrafts: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockEditsService = {
      cleanupAbandonedDrafts: vi.fn().mockResolvedValue({ count: 5 }),
    };

    processor = new EditsProcessor(mockEditsService as unknown as EditsService);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should process cleanup-abandoned-drafts successfully', async () => {
    const job = {
      id: 'job-1',
      name: 'cleanup-abandoned-drafts',
      data: {},
    } as unknown as Job<any, any, string>;

    const result = await processor.process(job);
    expect(mockEditsService.cleanupAbandonedDrafts).toHaveBeenCalled();
    expect(result).toEqual({ count: 5 });
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
