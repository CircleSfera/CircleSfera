import { Queue } from 'bullmq';
import { afterEach, describe, expect, it } from 'vitest';
import {
  registerRecurringJob,
  removeRecurringJob,
} from '../src/common/queues/recurring-jobs.js';

// Against a real Redis: a recurring job registered on every boot keeps exactly
// one scheduler and one next run, and a retired job leaves nothing behind.
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

  it('registering on every boot keeps one scheduler and one next run', async () => {
    queue = new Queue(`recurring-e2e-${Date.now()}`, { connection });

    for (let boot = 0; boot < 3; boot++) {
      await registerRecurringJob(
        queue,
        'cleanup_stories_cron',
        'cleanup-expired',
        '0 * * * *',
      );
    }

    const schedulers = await queue.getJobSchedulers();
    expect(schedulers.map((s) => s.key)).toEqual(['cleanup_stories_cron']);
    const delayed = await queue.getDelayed();
    expect(delayed.map((j) => j.name)).toEqual(['cleanup-expired']);
  });

  it('removes a retired job completely', async () => {
    queue = new Queue(`recurring-e2e-retired-${Date.now()}`, { connection });
    await registerRecurringJob(
      queue,
      'gdpr_search_cron',
      'clean-expired-search-history',
      '0 2 * * *',
    );

    await expect(
      removeRecurringJob(queue, 'clean-expired-search-history'),
    ).resolves.toBe(1);
    expect(await queue.getJobSchedulers()).toEqual([]);
    expect(await queue.getDelayed()).toEqual([]);
  });
});
