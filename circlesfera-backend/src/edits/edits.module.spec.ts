import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { EditsModule } from './edits.module.js';

describe('EditsModule', () => {
  it('takes the daily deletion of untouched drafts off the queue, and schedules nothing', async () => {
    const queue = {
      getJobSchedulers: vi.fn().mockResolvedValue([
        { key: 'edits_cleanup_cron', name: 'cleanup-abandoned-drafts' },
        { key: 'other', name: 'something-else' },
      ]),
      removeJobScheduler: vi.fn().mockResolvedValue(true),
      upsertJobScheduler: vi.fn(),
    };

    await new EditsModule(queue as unknown as Queue).onApplicationBootstrap();

    expect(queue.removeJobScheduler).toHaveBeenCalledTimes(1);
    expect(queue.removeJobScheduler).toHaveBeenCalledWith('edits_cleanup_cron');
    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
  });
});
