import type { Processor, RegisterQueueOptions } from '@nestjs/bullmq';
import type { DefaultJobOptions } from 'bullmq';

export type QueueWorkerOptions = NonNullable<Parameters<typeof Processor>[1]>;

/**
 * CircleSfera Canonical BullMQ Queue Names
 */
export const QUEUE_NAMES = {
  USERS_PROCESSING: 'users-processing',
  FEED_FANOUT: 'feed-fanout',
  NOTIFICATIONS_PROCESSING: 'notifications-processing',
  AI_PROCESSING: 'ai-processing',
  ANALYTICS_PROCESSING: 'analytics-processing',
  VIDEO_TRANSCODING: 'video-transcoding',
  MEDIA_CLEANUP: 'media-cleanup',
  STORIES_PROCESSING: 'stories-processing',
  POSTS_PROCESSING: 'posts-processing',
  CHAT_PROCESSING: 'chat-processing',
  EDITS_PROCESSING: 'edits-processing',
  SLACK_PROCESSING: 'slack-processing',
  WAREHOUSE_EXPORT: 'warehouse-export',
  EMAIL_PROCESSING: 'email-processing',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * CircleSfera Queue Workload Classes
 */
export const QUEUE_WORKLOAD_CLASSES = {
  CRITICAL_DATA: 'CRITICAL_DATA',
  EVENT_DISTRIBUTION: 'EVENT_DISTRIBUTION',
  HEAVY_COMPUTE: 'HEAVY_COMPUTE',
  AI_EXTERNAL: 'AI_EXTERNAL',
  BACKGROUND_SYNC: 'BACKGROUND_SYNC',
} as const;

export type QueueWorkloadClass =
  (typeof QUEUE_WORKLOAD_CLASSES)[keyof typeof QUEUE_WORKLOAD_CLASSES];

/**
 * Queue Policy Definition
 */
export interface QueuePolicyConfig {
  queueName: string;
  workloadClass: QueueWorkloadClass;
  description: string;
  defaultJobOptions: DefaultJobOptions;
  workerOptions: Pick<
    QueueWorkerOptions,
    'concurrency' | 'lockDuration' | 'maxStalledCount' | 'stalledInterval'
  >;
}

/**
 * Global Default Job Options for root BullModule configuration
 */
export const GLOBAL_DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: {
    age: 86400, // 24 hours
    count: 1000,
  },
  removeOnFail: {
    age: 7 * 86400, // 7 days
    count: 3000,
  },
};

/**
 * Baseline Worker Options for workers without specific overrides
 */
export const GLOBAL_DEFAULT_WORKER_OPTIONS: Pick<
  QueueWorkerOptions,
  'concurrency' | 'lockDuration' | 'maxStalledCount' | 'stalledInterval'
> = {
  concurrency: 2,
  lockDuration: 30000,
  maxStalledCount: 2,
  stalledInterval: 30000,
};

/**
 * Canonical Queue Policies per Workload Class
 */
export const QUEUE_POLICIES: Record<QueueName, QueuePolicyConfig> = {
  [QUEUE_NAMES.USERS_PROCESSING]: {
    queueName: QUEUE_NAMES.USERS_PROCESSING,
    workloadClass: QUEUE_WORKLOAD_CLASSES.CRITICAL_DATA,
    description:
      'Critical user lifecycle jobs (GDPR data export, account deletion). High compliance impact.',
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: {
        age: 7 * 86400, // 7 days audit window
        count: 1000,
      },
      removeOnFail: {
        age: 30 * 86400, // 30 days retention for legal/DLQ inspection
        count: 5000,
      },
    },
    workerOptions: {
      concurrency: 2,
      lockDuration: 120000, // 2 minutes for zip bundling and DB cascade
      maxStalledCount: 2,
      stalledInterval: 30000,
    },
  },

  [QUEUE_NAMES.FEED_FANOUT]: {
    queueName: QUEUE_NAMES.FEED_FANOUT,
    workloadClass: QUEUE_WORKLOAD_CLASSES.EVENT_DISTRIBUTION,
    description:
      'High-throughput hybrid feed distribution to follower inboxes.',
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 3600, // 1 hour (ephemeral high frequency)
        count: 2000,
      },
      removeOnFail: {
        age: 7 * 86400, // 7 days
        count: 5000,
      },
    },
    workerOptions: {
      concurrency: 5,
      lockDuration: 30000,
      maxStalledCount: 2,
      stalledInterval: 30000,
    },
  },

  [QUEUE_NAMES.NOTIFICATIONS_PROCESSING]: {
    queueName: QUEUE_NAMES.NOTIFICATIONS_PROCESSING,
    workloadClass: QUEUE_WORKLOAD_CLASSES.EVENT_DISTRIBUTION,
    description: 'Push notifications and user activity alerts.',
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 86400, // 24 hours
        count: 2000,
      },
      removeOnFail: {
        age: 7 * 86400, // 7 days
        count: 5000,
      },
    },
    workerOptions: {
      concurrency: 10,
      lockDuration: 30000,
      maxStalledCount: 2,
      stalledInterval: 30000,
    },
  },

  [QUEUE_NAMES.VIDEO_TRANSCODING]: {
    queueName: QUEUE_NAMES.VIDEO_TRANSCODING,
    workloadClass: QUEUE_WORKLOAD_CLASSES.HEAVY_COMPUTE,
    description:
      'FFmpeg multi-rendition HLS transcoding and video thumbnail generation.',
    defaultJobOptions: {
      attempts: 2, // Strict retry limit to prevent CPU thrashing on corrupted files
      backoff: {
        type: 'exponential',
        delay: 10000,
      },
      removeOnComplete: {
        age: 7 * 86400,
        count: 1000,
      },
      removeOnFail: {
        age: 14 * 86400,
        count: 2000,
      },
    },
    workerOptions: {
      concurrency: 2,
      lockDuration: 300000, // 5 minutes lock duration for long transcodes
      maxStalledCount: 1, // Fail fast on stalled video jobs
      stalledInterval: 30000,
    },
  },

  [QUEUE_NAMES.MEDIA_CLEANUP]: {
    queueName: QUEUE_NAMES.MEDIA_CLEANUP,
    workloadClass: QUEUE_WORKLOAD_CLASSES.HEAVY_COMPUTE,
    description: 'Asynchronous S3/MinIO unreferenced media file deletion.',
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: {
        age: 86400,
        count: 1000,
      },
      removeOnFail: {
        age: 14 * 86400,
        count: 2000,
      },
    },
    workerOptions: {
      concurrency: 2,
      lockDuration: 60000,
      maxStalledCount: 2,
      stalledInterval: 30000,
    },
  },

  [QUEUE_NAMES.EDITS_PROCESSING]: {
    queueName: QUEUE_NAMES.EDITS_PROCESSING,
    workloadClass: QUEUE_WORKLOAD_CLASSES.HEAVY_COMPUTE,
    description: 'Video reel assembly, audio slicing and render pipeline.',
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: {
        age: 86400,
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 86400,
        count: 2000,
      },
    },
    workerOptions: {
      concurrency: 2,
      lockDuration: 60000,
      maxStalledCount: 2,
      stalledInterval: 30000,
    },
  },

  [QUEUE_NAMES.AI_PROCESSING]: {
    queueName: QUEUE_NAMES.AI_PROCESSING,
    workloadClass: QUEUE_WORKLOAD_CLASSES.AI_EXTERNAL,
    description:
      'Content moderation, embeddings generation and automated alt-text via external AI providers.',
    defaultJobOptions: {
      attempts: 4, // Resilient to transient 429 rate-limits
      backoff: {
        type: 'exponential',
        delay: 3000,
      },
      removeOnComplete: {
        age: 86400,
        count: 2000,
      },
      removeOnFail: {
        age: 7 * 86400,
        count: 5000,
      },
    },
    workerOptions: {
      concurrency: 5,
      lockDuration: 45000,
      maxStalledCount: 2,
      stalledInterval: 30000,
    },
  },

  [QUEUE_NAMES.ANALYTICS_PROCESSING]: {
    queueName: QUEUE_NAMES.ANALYTICS_PROCESSING,
    workloadClass: QUEUE_WORKLOAD_CLASSES.BACKGROUND_SYNC,
    description:
      'Post interaction counters, performance scoring and metric rollups.',
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 86400,
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 86400,
        count: 2000,
      },
    },
    workerOptions: {
      concurrency: 3,
      lockDuration: 30000,
      maxStalledCount: 2,
      stalledInterval: 30000,
    },
  },

  [QUEUE_NAMES.STORIES_PROCESSING]: {
    queueName: QUEUE_NAMES.STORIES_PROCESSING,
    workloadClass: QUEUE_WORKLOAD_CLASSES.BACKGROUND_SYNC,
    description: 'Story 24h expiration and archive cleanup.',
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 86400,
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 86400,
        count: 2000,
      },
    },
    workerOptions: {
      concurrency: 3,
      lockDuration: 30000,
      maxStalledCount: 2,
      stalledInterval: 30000,
    },
  },

  [QUEUE_NAMES.POSTS_PROCESSING]: {
    queueName: QUEUE_NAMES.POSTS_PROCESSING,
    workloadClass: QUEUE_WORKLOAD_CLASSES.BACKGROUND_SYNC,
    description: 'Post media reconciliation and background post maintenance.',
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 86400,
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 86400,
        count: 2000,
      },
    },
    workerOptions: {
      concurrency: 3,
      lockDuration: 30000,
      maxStalledCount: 2,
      stalledInterval: 30000,
    },
  },

  [QUEUE_NAMES.CHAT_PROCESSING]: {
    queueName: QUEUE_NAMES.CHAT_PROCESSING,
    workloadClass: QUEUE_WORKLOAD_CLASSES.BACKGROUND_SYNC,
    description: 'Hourly chat ephemeral retention cleanup and message expiry.',
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 86400,
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 86400,
        count: 2000,
      },
    },
    workerOptions: {
      concurrency: 3,
      lockDuration: 30000,
      maxStalledCount: 2,
      stalledInterval: 30000,
    },
  },

  [QUEUE_NAMES.SLACK_PROCESSING]: {
    queueName: QUEUE_NAMES.SLACK_PROCESSING,
    workloadClass: QUEUE_WORKLOAD_CLASSES.BACKGROUND_SYNC,
    description: 'Internal operations reporting and daily briefing dispatch.',
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 86400,
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 86400,
        count: 2000,
      },
    },
    workerOptions: {
      concurrency: 2,
      lockDuration: 30000,
      maxStalledCount: 2,
      stalledInterval: 30000,
    },
  },

  [QUEUE_NAMES.EMAIL_PROCESSING]: {
    queueName: QUEUE_NAMES.EMAIL_PROCESSING,
    workloadClass: QUEUE_WORKLOAD_CLASSES.EVENT_DISTRIBUTION,
    description:
      'Transactional email delivery via Brevo (verification, password reset, welcome, receipts). Some are time-sensitive account-security flows.',
    defaultJobOptions: {
      attempts: 4, // Resilient to transient Brevo outages/rate-limits within a ~1h reset-token window
      backoff: {
        type: 'exponential',
        delay: 3000,
      },
      removeOnComplete: {
        age: 86400,
        count: 2000,
      },
      removeOnFail: {
        age: 7 * 86400,
        count: 5000,
      },
    },
    workerOptions: {
      concurrency: 5,
      lockDuration: 30000,
      maxStalledCount: 2,
      stalledInterval: 30000,
    },
  },

  [QUEUE_NAMES.WAREHOUSE_EXPORT]: {
    queueName: QUEUE_NAMES.WAREHOUSE_EXPORT,
    workloadClass: QUEUE_WORKLOAD_CLASSES.BACKGROUND_SYNC,
    description: 'ClickHouse batch exports and analytical data replication.',
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: {
        age: 7 * 86400,
        count: 1000,
      },
      removeOnFail: {
        age: 14 * 86400,
        count: 2000,
      },
    },
    workerOptions: {
      concurrency: 2,
      lockDuration: 120000, // 2 minutes for batch ETL queries
      maxStalledCount: 2,
      stalledInterval: 30000,
    },
  },
};

/**
 * Retrieve the full policy configuration for a given queue.
 * Falls back to sensible defaults if the queue is not explicitly configured.
 */
export function getQueuePolicy(queueName: string): QueuePolicyConfig {
  const policy = QUEUE_POLICIES[queueName as QueueName];
  if (policy) {
    return policy;
  }

  return {
    queueName,
    workloadClass: QUEUE_WORKLOAD_CLASSES.BACKGROUND_SYNC,
    description: `Dynamic queue policy fallback for "${queueName}"`,
    defaultJobOptions: GLOBAL_DEFAULT_JOB_OPTIONS,
    workerOptions: GLOBAL_DEFAULT_WORKER_OPTIONS,
  };
}

/**
 * Retrieve the defaultJobOptions for a queue.
 */
export function getQueueJobOptions(queueName: string): DefaultJobOptions {
  return getQueuePolicy(queueName).defaultJobOptions;
}

/**
 * Retrieve standard BullModule RegisterQueueOptions with explicit policy applied.
 */
export function getRegisterQueueOptions(
  queueName: QueueName,
): RegisterQueueOptions {
  return {
    name: queueName,
    defaultJobOptions: getQueueJobOptions(queueName),
  };
}

/**
 * Retrieve standard BullMQ worker options for a queue.
 */
export function getWorkerOptions(
  queueName: string,
  overrides?: Partial<QueueWorkerOptions>,
): QueueWorkerOptions {
  const policy = getQueuePolicy(queueName);
  return {
    ...policy.workerOptions,
    ...overrides,
  };
}
