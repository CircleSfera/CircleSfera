import { describe, expect, it, vi } from 'vitest';
import { registerRecurringJob, removeRecurringJob } from './recurring-jobs.js';

const queueWith = (schedulers: { key: string; name: string }[]) => ({
  getJobSchedulers: vi.fn().mockResolvedValue(schedulers),
  removeJobScheduler: vi.fn().mockResolvedValue(true),
  upsertJobScheduler: vi.fn().mockResolvedValue({}),
});

describe('recurring jobs', () => {
  it('replaces a legacy repeatable entry with a scheduler of the same name', async () => {
    const queue = queueWith([
      { key: 'b78c0e426e49678e9829a2e1f9a024e2', name: 'cleanup-expired' },
      { key: 'other_cron', name: 'other-job' },
    ]);

    await registerRecurringJob(
      queue as never,
      'cleanup_stories_cron',
      'cleanup-expired',
      '0 * * * *',
    );

    expect(queue.removeJobScheduler).toHaveBeenCalledTimes(1);
    expect(queue.removeJobScheduler).toHaveBeenCalledWith(
      'b78c0e426e49678e9829a2e1f9a024e2',
    );
    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      'cleanup_stories_cron',
      { pattern: '0 * * * *' },
      { name: 'cleanup-expired', data: {} },
    );
  });

  it('keeps the existing scheduler on a restart', async () => {
    const queue = queueWith([
      { key: 'cleanup_stories_cron', name: 'cleanup-expired' },
    ]);

    await registerRecurringJob(
      queue as never,
      'cleanup_stories_cron',
      'cleanup-expired',
      '0 * * * *',
    );

    expect(queue.removeJobScheduler).not.toHaveBeenCalled();
    expect(queue.upsertJobScheduler).toHaveBeenCalledTimes(1);
  });

  it('removes every entry of a retired job', async () => {
    const queue = queueWith([
      { key: 'legacy-hash', name: 'clean-expired-search-history' },
      { key: 'gdpr_exports_cron', name: 'clean-expired-data-exports' },
    ]);

    await expect(
      removeRecurringJob(queue as never, 'clean-expired-search-history'),
    ).resolves.toBe(1);
    expect(queue.removeJobScheduler).toHaveBeenCalledWith('legacy-hash');
  });
});
