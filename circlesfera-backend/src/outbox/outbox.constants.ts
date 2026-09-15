export const OUTBOX_LEASE_DURATION_MS = 60 * 1000; // 60 seconds lease
export const OUTBOX_MAX_RETRIES = 5;
export const OUTBOX_BATCH_SIZE = 50;

export interface EnqueueOutboxEventDto {
  queueName: string;
  eventName: string;
  payload: Record<string, unknown>;
  options?: {
    jobId?: string;
    priority?: number;
    delay?: number;
    attempts?: number;
    backoff?: unknown;
    removeOnComplete?: boolean | number;
    removeOnFail?: boolean | number;
    [key: string]: unknown;
  };
}

export interface OutboxEventRecord {
  id: string;
  queueName: string;
  eventName: string;
  payload: unknown;
  options: unknown;
  status: string;
  retryCount: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}

export interface OutboxDelegate {
  create(args: { data: Record<string, unknown> }): Promise<OutboxEventRecord>;
  findMany(args: {
    where?: Record<string, unknown>;
    orderBy?: Record<string, unknown>;
    take?: number;
  }): Promise<OutboxEventRecord[]>;
  updateMany(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<{ count: number }>;
  update(args: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<OutboxEventRecord>;
}
