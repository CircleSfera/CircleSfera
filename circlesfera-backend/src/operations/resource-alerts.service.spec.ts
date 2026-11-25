import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DISK_ALERT_RATIO,
  HEAP_ALERT_BYTES,
  RSS_ALERT_BYTES,
} from '../health/resource-budgets.js';
import {
  crossedThresholds,
  ResourceAlertsService,
} from './resource-alerts.service.js';
import type { ServerResources } from './server-resources.service.js';

const GIB = 1024 * 1024 * 1024;

function reading(over: Partial<ServerResources> = {}): ServerResources {
  return {
    generatedAt: '2026-11-25T10:00:00.000Z',
    host: {
      memoryTotalBytes: 8 * GIB,
      memoryAvailableBytes: 4 * GIB,
      loadAverage: [0.1, 0.1, 0.1],
      cpus: 4,
    },
    container: { memoryBytes: GIB / 2, memoryLimitBytes: null },
    process: {
      heapUsedBytes: GIB / 4,
      rssBytes: GIB / 2,
      heapAlertBytes: HEAP_ALERT_BYTES,
      rssAlertBytes: RSS_ALERT_BYTES,
    },
    disks: {
      alertRatio: DISK_ALERT_RATIO,
      root: { totalBytes: 100, freeBytes: 50, usedRatio: 0.5 },
      uploads: null,
    },
    database: { reachable: true, sizeBytes: 1000 },
    redis: {
      reachable: true,
      usedMemoryBytes: 10,
      peakMemoryBytes: 10,
      maxMemoryBytes: 0,
      evictedKeys: 0,
    },
    queues: [],
    notVisible: [],
    ...over,
  };
}

const overBudget = () =>
  reading({
    disks: {
      alertRatio: DISK_ALERT_RATIO,
      root: { totalBytes: 100, freeBytes: 10, usedRatio: 0.9 },
      uploads: null,
    },
  });

/** A Redis that keeps what SET NX is given, as the real one does. */
function fakeRedis() {
  const keys = new Map<string, string>();
  return {
    keys,
    set: vi.fn(async (key: string, value: string) => {
      if (keys.has(key)) return null;
      keys.set(key, value);
      return 'OK';
    }),
  };
}

function setup(
  collect: () => Promise<ServerResources>,
  redis: object = fakeRedis(),
) {
  const events = { emit: vi.fn() };
  const service = new ResourceAlertsService(
    { collect: vi.fn(collect) } as never,
    redis as never,
    events as never,
  );
  return { service, events };
}

const MORNING = new Date('2026-11-25T08:00:00Z');
const EVENING = new Date('2026-11-25T20:00:00Z');
const NEXT_DAY = new Date('2026-11-26T08:00:00Z');

describe('the thresholds of ADR-0024', () => {
  it('crosses none within budget', () => {
    expect(crossedThresholds(reading())).toEqual([]);
  });

  it('crosses disk at 90%, heap and RSS at 1 GB, and an unreachable database or Redis', () => {
    const alerts = crossedThresholds(
      reading({
        process: {
          heapUsedBytes: HEAP_ALERT_BYTES,
          rssBytes: RSS_ALERT_BYTES + 1,
          heapAlertBytes: HEAP_ALERT_BYTES,
          rssAlertBytes: RSS_ALERT_BYTES,
        },
        disks: {
          alertRatio: DISK_ALERT_RATIO,
          root: { totalBytes: 100, freeBytes: 8, usedRatio: 0.92 },
          uploads: null,
        },
        database: { reachable: false, sizeBytes: null },
        redis: {
          reachable: false,
          usedMemoryBytes: null,
          peakMemoryBytes: null,
          maxMemoryBytes: null,
          evictedKeys: null,
        },
      }),
    );

    expect(alerts.map((alert) => alert.key)).toEqual([
      'disk',
      'heap',
      'rss',
      'database_unreachable',
      'redis_unreachable',
    ]);
    expect(alerts[0].message).toBe(
      'Disk of the server at 92% (ADR-0024 alert at 90%)',
    );
    expect(alerts[1].message).toBe(
      'Backend heap at 1.00 GB (ADR-0024 alert at 1.00 GB)',
    );
  });

  it('does not alert on a disk it could not read', () => {
    expect(
      crossedThresholds(
        reading({
          disks: { alertRatio: DISK_ALERT_RATIO, root: null, uploads: null },
        }),
      ),
    ).toEqual([]);
  });
});

describe('ResourceAlertsService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('alerts the incident channel once per threshold per day', async () => {
    const redis = fakeRedis();
    const { service, events } = setup(async () => overBudget(), redis);

    await expect(service.checkThresholds(MORNING)).resolves.toEqual(['disk']);
    await expect(service.checkThresholds(EVENING)).resolves.toEqual([]);

    expect(events.emit).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith('system.incident', {
      message:
        '[Resource alert] Disk of the server at 90% (ADR-0024 alert at 90%)',
      path: 'operational://resources',
      statusCode: 503,
      timestamp: MORNING.toISOString(),
    });
    expect(redis.set).toHaveBeenCalledWith(
      'ops:resource-alert:disk:2026-11-25',
      '1',
      'EX',
      2 * 24 * 60 * 60,
      'NX',
    );

    await expect(service.checkThresholds(NEXT_DAY)).resolves.toEqual(['disk']);
    expect(events.emit).toHaveBeenCalledTimes(2);
  });

  it('says nothing while every resource is within budget', async () => {
    const { service, events } = setup(async () => reading());

    await expect(service.checkThresholds(MORNING)).resolves.toEqual([]);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('still alerts once a day when Redis is down, remembering it itself', async () => {
    const down = { set: vi.fn().mockRejectedValue(new Error('redis down')) };
    const { service, events } = setup(
      async () =>
        reading({
          redis: {
            reachable: false,
            usedMemoryBytes: null,
            peakMemoryBytes: null,
            maxMemoryBytes: null,
            evictedKeys: null,
          },
        }),
      down,
    );

    await expect(service.checkThresholds(MORNING)).resolves.toEqual([
      'redis_unreachable',
    ]);
    await expect(service.checkThresholds(EVENING)).resolves.toEqual([]);
    await expect(service.checkThresholds(NEXT_DAY)).resolves.toEqual([
      'redis_unreachable',
    ]);
    expect(events.emit).toHaveBeenCalledTimes(2);
  });

  it('does not send again, once Redis is back, what it sent from memory that day', async () => {
    const back = fakeRedis();
    let redisDown = true;
    const redis = {
      set: vi.fn(async (key: string, value: string) => {
        if (redisDown) throw new Error('redis down');
        return back.set(key, value);
      }),
    };
    const { service, events } = setup(async () => overBudget(), redis);

    await expect(service.checkThresholds(MORNING)).resolves.toEqual(['disk']);
    redisDown = false;
    await expect(service.checkThresholds(EVENING)).resolves.toEqual([]);

    expect(events.emit).toHaveBeenCalledTimes(1);
    // The mark reaches Redis, for the other instances.
    expect(back.keys.has('ops:resource-alert:disk:2026-11-25')).toBe(true);
    // A new day is a new alert.
    await expect(service.checkThresholds(NEXT_DAY)).resolves.toEqual(['disk']);
  });

  it('sends nothing when the resources cannot be read', async () => {
    const { service, events } = setup(async () => {
      throw new Error('unreadable');
    });

    await expect(service.checkThresholds()).resolves.toEqual([]);
    expect(events.emit).not.toHaveBeenCalled();
  });
});
