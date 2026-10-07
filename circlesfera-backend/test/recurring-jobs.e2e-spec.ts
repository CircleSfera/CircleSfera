import { Queue } from 'bullmq';
import { afterEach, describe, expect, it } from 'vitest';
import {
  registerRecurringJob,
  removeRecurringJob,
} from '../src/common/queues/recurring-jobs.js';

// Against a real Redis: moving a job registered with the legacy `repeat`
// option to a Job Scheduler leaves exactly one schedule and one next run,
// and registering again on restart changes nothing.
describe('Recurring jobs on Redis (e2e)', () => {
  let queue: Queue;

  afterEach(async () => {
    await queue.obliterate({ force: true });
    await queue.close();
  });

  const connection = {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  };

  it('replaces a legacy repeatable job with one scheduler and one next run', async () => {
    queue = new Queue(`recurring-e2e-${Date.now()}`, { connection });
    await queue.add(
      'cleanup-expired',
      {},
      { repeat: { pattern: '0 * * * *' }, jobId: 'cleanup_stories_cron' },
    );

    await registerRecurringJob(
      queue,
      'cleanup_stories_cron',
      'cleanup-expired',
      '0 * * * *',
    );
    await registerRecurringJob(
      queue,
      'cleanup_stories_cron',
      'cleanup-expired',
      '0 * * * *',
    );

    const schedulers = await queue.getJobSchedulers();
    expect(schedulers.map((s) => s.key)).toEqual(['cleanup_stories_cron']);
    const delayed = await queue.getDelayed();
    expect(delayed.map((j) => j.name)).toEqual(['cleanup-expired']);
    expect(delayed[0].id).toMatch(/^repeat:cleanup_stories_cron:/);
  });

  it('removes a retired job completely', async () => {
    queue = new Queue(`recurring-e2e-retired-${Date.now()}`, { connection });
    await queue.add(
      'clean-expired-search-history',
      {},
      { repeat: { pattern: '0 2 * * *' }, jobId: 'gdpr_search_cron' },
    );

    await expect(
      removeRecurringJob(queue, 'clean-expired-search-history'),
    ).resolves.toBe(1);
    expect(await queue.getJobSchedulers()).toEqual([]);
    expect(await queue.getDelayed()).toEqual([]);
  });
});
