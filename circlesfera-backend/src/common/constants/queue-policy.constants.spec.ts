import { describe, expect, it } from 'vitest';
import {
  GLOBAL_DEFAULT_JOB_OPTIONS,
  GLOBAL_DEFAULT_WORKER_OPTIONS,
  getQueueJobOptions,
  getQueuePolicy,
  getRegisterQueueOptions,
  getWorkerOptions,
  QUEUE_NAMES,
  QUEUE_POLICIES,
  QUEUE_WORKLOAD_CLASSES,
  type QueueName,
} from './queue-policy.constants.js';

describe('Queue Policy Constants & Helpers (QUEUE-001)', () => {
  it('defines all 13 canonical queues in the system', () => {
    const queueValues = Object.values(QUEUE_NAMES);
    expect(queueValues).toHaveLength(13);
    expect(queueValues).toContain('users-processing');
    expect(queueValues).toContain('feed-fanout');
    expect(queueValues).toContain('notifications-processing');
    expect(queueValues).toContain('video-transcoding');
    expect(queueValues).toContain('media-cleanup');
    expect(queueValues).toContain('edits-processing');
    expect(queueValues).toContain('ai-processing');
    expect(queueValues).toContain('analytics-processing');
    expect(queueValues).toContain('stories-processing');
    expect(queueValues).toContain('posts-processing');
    expect(queueValues).toContain('chat-processing');
    expect(queueValues).toContain('slack-processing');
    expect(queueValues).toContain('warehouse-export');
  });

  it('defines explicit policies for every canonical queue', () => {
    for (const queueName of Object.values(QUEUE_NAMES)) {
      const policy = QUEUE_POLICIES[queueName as QueueName];
      expect(policy).toBeDefined();
      expect(policy.queueName).toBe(queueName);
      expect(policy.workloadClass).toBeDefined();
      expect(policy.defaultJobOptions.attempts).toBeGreaterThanOrEqual(2);
      expect(policy.defaultJobOptions.backoff).toBeDefined();
      expect(policy.defaultJobOptions.removeOnComplete).toBeDefined();
      expect(policy.defaultJobOptions.removeOnFail).toBeDefined();
      expect(policy.workerOptions.concurrency).toBeGreaterThanOrEqual(1);
      expect(policy.workerOptions.lockDuration).toBeGreaterThanOrEqual(30000);
      expect(policy.workerOptions.maxStalledCount).toBeGreaterThanOrEqual(1);
    }
  });

  describe('Critical Queue Workload Policy (CRITICAL_DATA)', () => {
    it('enforces 5 attempts, exponential backoff, and 30-day failure retention for users-processing', () => {
      const policy = getQueuePolicy(QUEUE_NAMES.USERS_PROCESSING);
      expect(policy.workloadClass).toBe(QUEUE_WORKLOAD_CLASSES.CRITICAL_DATA);
      expect(policy.defaultJobOptions.attempts).toBe(5);
      expect(policy.defaultJobOptions.backoff).toEqual({
        type: 'exponential',
        delay: 5000,
      });
      // 30 days retention for failed jobs (compliance / audit)
      expect(policy.defaultJobOptions.removeOnFail).toEqual({
        age: 30 * 86400,
        count: 5000,
      });
      // 7 days retention for completed jobs
      expect(policy.defaultJobOptions.removeOnComplete).toEqual({
        age: 7 * 86400,
        count: 1000,
      });
      // Long lock duration for export zip archiving and deletion cascades
      expect(policy.workerOptions.lockDuration).toBeGreaterThanOrEqual(120000);
    });
  });

  describe('Event Distribution Policy (EVENT_DISTRIBUTION)', () => {
    it('enforces high throughput, short completed retention, and exponential backoff for feed-fanout', () => {
      const policy = getQueuePolicy(QUEUE_NAMES.FEED_FANOUT);
      expect(policy.workloadClass).toBe(
        QUEUE_WORKLOAD_CLASSES.EVENT_DISTRIBUTION,
      );
      expect(policy.defaultJobOptions.attempts).toBe(3);
      // Evict completed within 1 hour to prevent Redis memory bloat
      expect(policy.defaultJobOptions.removeOnComplete).toEqual({
        age: 3600,
        count: 2000,
      });
      expect(policy.workerOptions.concurrency).toBe(5);
    });

    it('enforces higher concurrency for notifications-processing', () => {
      const policy = getQueuePolicy(QUEUE_NAMES.NOTIFICATIONS_PROCESSING);
      expect(policy.workloadClass).toBe(
        QUEUE_WORKLOAD_CLASSES.EVENT_DISTRIBUTION,
      );
      expect(policy.defaultJobOptions.attempts).toBe(3);
      expect(policy.workerOptions.concurrency).toBe(10);
    });
  });

  describe('Heavy Compute Policy (HEAVY_COMPUTE)', () => {
    it('limits video-transcoding attempts to 2 and extends lock duration to 5 minutes', () => {
      const policy = getQueuePolicy(QUEUE_NAMES.VIDEO_TRANSCODING);
      expect(policy.workloadClass).toBe(QUEUE_WORKLOAD_CLASSES.HEAVY_COMPUTE);
      expect(policy.defaultJobOptions.attempts).toBe(2);
      expect(policy.defaultJobOptions.backoff).toEqual({
        type: 'exponential',
        delay: 10000,
      });
      expect(policy.workerOptions.lockDuration).toBe(300000); // 5 minutes
      expect(policy.workerOptions.maxStalledCount).toBe(1); // Fail fast if stalled
    });

    it('configures media-cleanup with exponential backoff and safe retention', () => {
      const policy = getQueuePolicy(QUEUE_NAMES.MEDIA_CLEANUP);
      expect(policy.workloadClass).toBe(QUEUE_WORKLOAD_CLASSES.HEAVY_COMPUTE);
      expect(policy.defaultJobOptions.attempts).toBe(3);
      expect(policy.workerOptions.lockDuration).toBe(60000);
    });
  });

  describe('External AI Policy (AI_EXTERNAL)', () => {
    it('configures ai-processing with 4 attempts to handle transient 429 rate limits', () => {
      const policy = getQueuePolicy(QUEUE_NAMES.AI_PROCESSING);
      expect(policy.workloadClass).toBe(QUEUE_WORKLOAD_CLASSES.AI_EXTERNAL);
      expect(policy.defaultJobOptions.attempts).toBe(4);
      expect(policy.defaultJobOptions.backoff).toEqual({
        type: 'exponential',
        delay: 3000,
      });
      expect(policy.workerOptions.concurrency).toBe(5);
    });
  });

  describe('getRegisterQueueOptions helper', () => {
    it('returns valid RegisterQueueOptions for BullModule.registerQueue', () => {
      const options = getRegisterQueueOptions(QUEUE_NAMES.USERS_PROCESSING);
      expect(options.name).toBe('users-processing');
      expect(options.defaultJobOptions).toEqual(
        QUEUE_POLICIES[QUEUE_NAMES.USERS_PROCESSING].defaultJobOptions,
      );
    });
  });

  describe('getWorkerOptions helper', () => {
    it('returns worker options and allows specific overrides', () => {
      const defaultWorkerOpts = getWorkerOptions(QUEUE_NAMES.FEED_FANOUT);
      expect(defaultWorkerOpts.concurrency).toBe(5);
      expect(defaultWorkerOpts.lockDuration).toBe(30000);

      const overriddenOpts = getWorkerOptions(QUEUE_NAMES.FEED_FANOUT, {
        concurrency: 8,
      });
      expect(overriddenOpts.concurrency).toBe(8);
      expect(overriddenOpts.lockDuration).toBe(30000);
    });
  });

  describe('Fallback policy for unregistered queues', () => {
    it('provides safe fallback policy when queue is unknown', () => {
      const unknownPolicy = getQueuePolicy('unknown-queue-name');
      expect(unknownPolicy.queueName).toBe('unknown-queue-name');
      expect(unknownPolicy.workloadClass).toBe(
        QUEUE_WORKLOAD_CLASSES.BACKGROUND_SYNC,
      );
      expect(unknownPolicy.defaultJobOptions).toEqual(
        GLOBAL_DEFAULT_JOB_OPTIONS,
      );
      expect(unknownPolicy.workerOptions).toEqual(
        GLOBAL_DEFAULT_WORKER_OPTIONS,
      );
    });

    it('returns fallback job options via getQueueJobOptions', () => {
      const jobOpts = getQueueJobOptions('nonexistent-queue');
      expect(jobOpts).toEqual(GLOBAL_DEFAULT_JOB_OPTIONS);
    });
  });
});
