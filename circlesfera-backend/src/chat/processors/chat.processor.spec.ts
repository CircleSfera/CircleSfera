import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CleanupExpiredMessagesUseCase } from '../use-cases/system/cleanup-expired-messages.use-case.js';
import { ChatProcessor } from './chat.processor.js';

describe('ChatProcessor', () => {
  let processor: ChatProcessor;
  let mockCleanupUseCase: { execute: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockCleanupUseCase = {
      execute: vi.fn(),
    };
    processor = new ChatProcessor(
      mockCleanupUseCase as unknown as CleanupExpiredMessagesUseCase,
    );
  });

  it('processes cleanup-expired-messages job successfully', async () => {
    mockCleanupUseCase.execute.mockResolvedValue({ count: 5 });

    const job = {
      name: 'cleanup-expired-messages',
      id: 'job-1',
      data: {},
    } as any;

    const result = await processor.process(job);

    expect(mockCleanupUseCase.execute).toHaveBeenCalled();
    expect(result).toEqual({ count: 5 });
  });

  it('throws UnrecoverableError on unknown job name', async () => {
    const job = {
      name: 'unknown-job',
      id: 'job-2',
      data: {},
    } as any;

    await expect(processor.process(job)).rejects.toThrow(UnrecoverableError);
  });
});
