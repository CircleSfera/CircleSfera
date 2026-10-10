/**
 * The id a job is given so that the same work is not queued twice.
 *
 * The queue library refuses an id that contains a colon (it keeps the colon
 * for its own keys), and the refusal fails the request that queues the job.
 * Parts are joined with a hyphen and any colon inside them becomes one.
 */
export function queueJobId(...parts: string[]): string {
  return parts.join('-').replaceAll(':', '-');
}
