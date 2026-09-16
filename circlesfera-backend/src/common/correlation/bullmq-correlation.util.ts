import type { Job } from 'bullmq';
import { CorrelationContext } from './correlation.context.js';

/**
 * Executes a BullMQ worker job within a correlation scope extracted from job metadata.
 */
export async function withJobCorrelation<T>(
  job: Job,
  fn: () => Promise<T>,
): Promise<T> {
  const jobData = job.data as Record<string, unknown> | undefined;
  const correlationId =
    (typeof jobData?._correlationId === 'string' && jobData._correlationId) ||
    (typeof job.id === 'string'
      ? `job_${job.id}`
      : CorrelationContext.generateId());

  return CorrelationContext.run(correlationId, fn);
}

/**
 * Attaches the active ambient correlation ID (or a freshly generated one) to a job data payload.
 */
export function attachJobCorrelation<T extends Record<string, unknown>>(
  data: T,
): T & { _correlationId: string } {
  const correlationId =
    CorrelationContext.getId() || CorrelationContext.generateId();
  return {
    ...data,
    _correlationId: correlationId,
  };
}
