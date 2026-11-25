import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Queue } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocketPresenceService } from '../socket/services/socket-presence.service.js';
import {
  DEFAULT_OPERATIONAL_THRESHOLDS,
  OperationalMetricsService,
} from './operational-metrics.service.js';

describe('OperationalMetricsService', () => {
  let service: OperationalMetricsService;
  let mockEventEmitter: { emit: ReturnType<typeof vi.fn> };
  let mockPresenceService: {
    getOnlineUsersCount: ReturnType<typeof vi.fn>;
  };
  let mockVideoQueue: {
    name: string;
    getJobCounts: ReturnType<typeof vi.fn>;
    getJobs: ReturnType<typeof vi.fn>;
  };
  let mockNotificationsQueue: {
    name: string;
    getJobCounts: ReturnType<typeof vi.fn>;
    getJobs: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockEventEmitter = { emit: vi.fn() };
    mockPresenceService = {
      getOnlineUsersCount: vi.fn().mockResolvedValue(42),
    };
    mockVideoQueue = {
      name: 'video-transcoding',
      getJobCounts: vi.fn().mockResolvedValue({
        waiting: 2,
        active: 1,
        failed: 0,
        delayed: 0,
      }),
      getJobs: vi.fn().mockResolvedValue([]),
    };
    mockNotificationsQueue = {
      name: 'notifications-processing',
      getJobCounts: vi.fn().mockResolvedValue({
        waiting: 5,
        active: 2,
        failed: 1,
        delayed: 0,
      }),
      getJobs: vi.fn().mockResolvedValue([]),
    };

    service = new OperationalMetricsService(
      mockEventEmitter as unknown as EventEmitter2,
      mockPresenceService as unknown as SocketPresenceService,
      mockVideoQueue as unknown as Queue,
      mockNotificationsQueue as unknown as Queue,
    );
  });

  it('exposes and updates threshold configurations', () => {
    expect(service.getThresholds()).toEqual(DEFAULT_OPERATIONAL_THRESHOLDS);

    service.setThresholds({ queueWaitingWarn: 50 });
    expect(service.getThresholds().queueWaitingWarn).toBe(50);
  });

  it('collects metrics and returns HEALTHY status when within thresholds', async () => {
    const snapshot = await service.collectMetrics();

    expect(snapshot.overallStatus).toBe('HEALTHY');
    expect(snapshot.queues.length).toBe(2);
    expect(snapshot.media.transcodingQueueDepth).toBe(2);
    expect(snapshot.media.backlogStatus).toBe('HEALTHY');
    expect(snapshot.realtime.onlineUsersCount).toBe(42);
    expect(snapshot.alerts).toHaveLength(0);

    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'system.metrics.operational',
      expect.objectContaining({
        overallStatus: 'HEALTHY',
        queuesCount: 2,
        totalWaitingJobs: 7,
      }),
    );
  });

  it('detects queue backlog warning when waiting exceeds queueWaitingWarn', async () => {
    mockNotificationsQueue.getJobCounts.mockResolvedValue({
      waiting: 150,
      active: 10,
      failed: 0,
      delayed: 0,
    });

    const snapshot = await service.collectMetrics();

    expect(snapshot.overallStatus).toBe('DEGRADED');
    expect(snapshot.alerts.some((a) => a.severity === 'WARN')).toBe(true);
    expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(
      'system.incident',
      expect.anything(),
    );
  });

  it('detects critical queue backlog and escalates system incident when waiting exceeds queueWaitingAlert', async () => {
    mockNotificationsQueue.getJobCounts.mockResolvedValue({
      waiting: 600,
      active: 5,
      failed: 0,
      delayed: 0,
    });

    const snapshot = await service.collectMetrics();

    expect(snapshot.overallStatus).toBe('CRITICAL');
    expect(
      snapshot.alerts.some(
        (a) => a.severity === 'ALERT' && a.metric === 'waiting',
      ),
    ).toBe(true);
    expect(mockEventEmitter.emit).toHaveBeenCalledWith(
      'system.incident',
      expect.objectContaining({
        statusCode: 503,
        path: 'operational://metrics',
      }),
    );
  });

  it('detects media backlog degradation and critical state', async () => {
    mockVideoQueue.getJobCounts.mockResolvedValue({
      waiting: 25,
      active: 1,
      failed: 0,
      delayed: 0,
    });

    let snapshot = await service.collectMetrics();
    expect(snapshot.media.backlogStatus).toBe('DEGRADED');

    mockVideoQueue.getJobCounts.mockResolvedValue({
      waiting: 120,
      active: 1,
      failed: 0,
      delayed: 0,
    });

    snapshot = await service.collectMetrics();
    expect(snapshot.media.backlogStatus).toBe('CRITICAL');
    expect(
      snapshot.alerts.some(
        (a) => a.component === 'media' && a.severity === 'ALERT',
      ),
    ).toBe(true);
  });

  it('detects stalled queue when oldest job age exceeds threshold without active jobs', async () => {
    const oldTimestamp = Date.now() - 400_000; // 400 seconds old (> 300s alert threshold)
    mockNotificationsQueue.getJobCounts.mockResolvedValue({
      waiting: 10,
      active: 0,
      failed: 0,
      delayed: 0,
    });
    mockNotificationsQueue.getJobs.mockResolvedValue([
      { timestamp: oldTimestamp },
    ]);

    const snapshot = await service.collectMetrics();
    const queueMetric = snapshot.queues.find(
      (q) => q.name === 'notifications-processing',
    );

    expect(queueMetric?.isStalled).toBe(true);
    expect(
      snapshot.alerts.some(
        (a) => a.metric === 'oldestJobAgeMs' && a.severity === 'ALERT',
      ),
    ).toBe(true);
  });

  it('marks realtime status DEGRADED if presence query fails', async () => {
    mockPresenceService.getOnlineUsersCount.mockRejectedValue(
      new Error('Redis connection lost'),
    );

    const snapshot = await service.collectMetrics();

    expect(snapshot.realtime.status).toBe('DEGRADED');
    expect(snapshot.overallStatus).toBe('DEGRADED');
  });

  describe('escalation once per threshold per UTC day', () => {
    /** A Redis that keeps what SET NX is given, as the real one does. */
    const fakeRedis = () => {
      const keys = new Map<string, string>();
      return {
        keys,
        set: vi.fn(async (key: string, value: string) => {
          if (keys.has(key)) return null;
          keys.set(key, value);
          return 'OK';
        }),
      };
    };
    const incidents = () =>
      mockEventEmitter.emit.mock.calls.filter(
        ([event]) => event === 'system.incident',
      );
    const backlog = (waiting: number) =>
      mockNotificationsQueue.getJobCounts.mockResolvedValue({
        waiting,
        active: 5,
        failed: 0,
        delayed: 0,
      });
    let redis: ReturnType<typeof fakeRedis>;

    beforeEach(() => {
      redis = fakeRedis();
      service = new OperationalMetricsService(
        mockEventEmitter as unknown as EventEmitter2,
        mockPresenceService as unknown as SocketPresenceService,
        mockVideoQueue as unknown as Queue,
        mockNotificationsQueue as unknown as Queue,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        redis as never,
      );
      vi.useFakeTimers({ toFake: ['Date'] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('tells a lasting backlog once a day, not on every run', async () => {
      backlog(600);
      vi.setSystemTime(new Date('2026-11-25T08:00:00Z'));
      await service.collectMetrics();
      vi.setSystemTime(new Date('2026-11-25T08:01:00Z'));
      const second = await service.collectMetrics();

      // Still critical on the page, but told once.
      expect(second.overallStatus).toBe('CRITICAL');
      expect(incidents()).toHaveLength(1);
      expect(redis.set).toHaveBeenCalledWith(
        'ops:queue-alert:queue:notifications-processing:waiting:ALERT:500:2026-11-25',
        '1',
        'EX',
        2 * 24 * 60 * 60,
        'NX',
      );

      vi.setSystemTime(new Date('2026-11-26T08:00:00Z'));
      await service.collectMetrics();
      expect(incidents()).toHaveLength(2);
    });

    it('still tells a higher tier reached the same day, once', async () => {
      vi.setSystemTime(new Date('2026-11-25T08:00:00Z'));
      backlog(150); // WARN: shown, never escalated
      await service.collectMetrics();
      expect(incidents()).toHaveLength(0);

      backlog(600); // ALERT
      vi.setSystemTime(new Date('2026-11-25T09:00:00Z'));
      await service.collectMetrics();
      expect(incidents()).toHaveLength(1);
      expect(incidents()[0][1].message).toContain(
        'Queue [notifications-processing] backlog critical: 600 jobs waiting.',
      );

      vi.setSystemTime(new Date('2026-11-25T10:00:00Z'));
      await service.collectMetrics();
      expect(incidents()).toHaveLength(1);
    });

    it('tells a new threshold crossed later the same day, with only what is new', async () => {
      vi.setSystemTime(new Date('2026-11-25T08:00:00Z'));
      backlog(600);
      await service.collectMetrics();

      mockNotificationsQueue.getJobCounts.mockResolvedValue({
        waiting: 600,
        active: 5,
        failed: 60,
        delayed: 0,
      });
      vi.setSystemTime(new Date('2026-11-25T09:00:00Z'));
      await service.collectMetrics();

      expect(incidents()).toHaveLength(2);
      expect(incidents()[1][1].message).toContain('excessive failures');
      expect(incidents()[1][1].message).not.toContain('backlog critical');
    });
  });
});
