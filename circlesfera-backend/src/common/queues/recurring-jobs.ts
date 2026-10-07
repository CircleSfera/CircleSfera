import type { Queue } from 'bullmq';

// Recurring jobs run through BullMQ Job Schedulers. The legacy `repeat`
// option on Queue#add is removed in BullMQ 6, and its entries in Redis would
// keep firing next to a scheduler, running the job twice. Registration
// therefore removes any other scheduler entry for the same job name (the
// legacy ones are keyed by a hash) before upserting the scheduler.
//
// An unchanged scheduler is left alone: upserting replaces its pending next
// run with the following occurrence, so a restart at the scheduled time
// would skip that run.
export async function registerRecurringJob(
  queue: Queue,
  schedulerId: string,
  name: string,
  pattern: string,
): Promise<void> {
  await removeRecurringJob(queue, name, schedulerId);
  const current = await queue.getJobScheduler(schedulerId);
  if (current?.name === name && current.pattern === pattern) return;
  await queue.upsertJobScheduler(schedulerId, { pattern }, { name, data: {} });
}

// Removes every scheduler entry (legacy or current) for a job name, except
// the one to keep, together with its pending next run.
export async function removeRecurringJob(
  queue: Queue,
  name: string,
  keep?: string,
): Promise<number> {
  let removed = 0;
  for (const scheduler of await queue.getJobSchedulers()) {
    if (scheduler.name === name && scheduler.key !== keep) {
      if (await queue.removeJobScheduler(scheduler.key)) removed++;
    }
  }
  return removed;
}
