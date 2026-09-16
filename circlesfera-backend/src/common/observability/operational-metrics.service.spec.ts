import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { Queue } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocketPresenceService } from '../../socket/services/socket-presence.service.js';
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
});
