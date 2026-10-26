import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { StoriesModule } from './stories.module.js';

describe('StoriesModule', () => {
  it('takes the hourly deletion of expired stories off the queue, and schedules nothing', async () => {
    const queue = {
      getJobSchedulers: vi.fn().mockResolvedValue([
        { key: 'cleanup_stories_cron', name: 'cleanup-expired' },
        { key: 'other', name: 'something-else' },
      ]),
      removeJobScheduler: vi.fn().mockResolvedValue(true),
      upsertJobScheduler: vi.fn(),
    };

    await new StoriesModule(queue as unknown as Queue).onApplicationBootstrap();

    expect(queue.removeJobScheduler).toHaveBeenCalledTimes(1);
    expect(queue.removeJobScheduler).toHaveBeenCalledWith(
      'cleanup_stories_cron',
    );
    expect(queue.upsertJobScheduler).not.toHaveBeenCalled();
  });
});
