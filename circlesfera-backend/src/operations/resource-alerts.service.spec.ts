import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DISK_ALERT_RATIO,
  HEAP_ALERT_BYTES,
  RSS_ALERT_BYTES,
} from '../health/resource-budgets.js';
import { ALERT_PENDING_MS } from '../observability/daily-alert-gate.js';
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

/** A Redis that keeps the keys it is given; `down` makes it fail. */
function fakeRedis() {
  const keys = new Map<string, string>();
  const state = { down: false };
  const fail = () => {
    if (state.down) throw new Error('redis down');
  };
  return {
    keys,
    state,
    set: vi.fn(async (key: string, value: string) => {
      fail();
      keys.set(key, value);
      return 'OK';
    }),
    exists: vi.fn(async (key: string) => {
      fail();
      return keys.has(key) ? 1 : 0;
    }),
  };
}

/** Slack as the incident channel: it says whether each alert reached it. */
function slack() {
  const state = { delivers: true, answers: true };
  const emit = vi.fn(
    (_event: string, payload: { onDelivered?: (ok: boolean) => void }) => {
      if (state.answers) payload.onDelivered?.(state.delivers);
    },
  );
  return { state, emit };
}

function setup(
  collect: () => Promise<ServerResources>,
  redis: object = fakeRedis(),
) {
  const events = slack();
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
      onDelivered: expect.any(Function),
    });
    expect(redis.set).toHaveBeenCalledWith(
      'ops:resource-alert:disk:2026-11-25',
      '1',
      'EX',
      2 * 24 * 60 * 60,
    );

    await expect(service.checkThresholds(NEXT_DAY)).resolves.toEqual(['disk']);
    expect(events.emit).toHaveBeenCalledTimes(2);
  });

  it('sends again later the same day an alert Slack did not receive', async () => {
    const redis = fakeRedis();
    const { service, events } = setup(async () => overBudget(), redis);

    events.state.delivers = false;
    await expect(service.checkThresholds(MORNING)).resolves.toEqual(['disk']);
    expect(redis.keys.size).toBe(0);

    events.state.delivers = true;
    await expect(service.checkThresholds(EVENING)).resolves.toEqual(['disk']);
    await expect(
      service.checkThresholds(new Date('2026-11-25T21:00:00Z')),
    ).resolves.toEqual([]);
    expect(events.emit).toHaveBeenCalledTimes(2);
  });

  it('does not send twice when two checks overlap', async () => {
    const redis = fakeRedis();
    let release: () => void = () => {};
    redis.exists.mockImplementationOnce(
      () =>
        new Promise<0 | 1>((resolve) => {
          release = () => resolve(0);
        }),
    );
    const { service, events } = setup(async () => overBudget(), redis);
    events.state.answers = false; // Slack has not answered yet

    const first = service.checkThresholds(MORNING);
    const second = service.checkThresholds(MORNING);
    await new Promise((resolve) => setImmediate(resolve));
    release();

    const sent = [...(await first), ...(await second)];
    expect(sent).toEqual(['disk']);
    expect(events.emit).toHaveBeenCalledTimes(1);
  });

  it('frees a claim no channel answered for, after a while', async () => {
    const { service, events } = setup(async () => overBudget());
    events.state.answers = false;

    await service.checkThresholds(MORNING);
    await expect(
      service.checkThresholds(new Date(MORNING.getTime() + 60_000)),
    ).resolves.toEqual([]);
    await expect(
      service.checkThresholds(new Date(MORNING.getTime() + ALERT_PENDING_MS)),
    ).resolves.toEqual(['disk']);
  });

  it('does not send again what another instance or a restart sent today', async () => {
    const redis = fakeRedis();
    redis.keys.set('ops:resource-alert:disk:2026-11-25', '1');
    const { service, events } = setup(async () => overBudget(), redis);

    await expect(service.checkThresholds(MORNING)).resolves.toEqual([]);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('does not send again an alert sent through Redis when Redis then fails', async () => {
    const redis = fakeRedis();
    const { service, events } = setup(async () => overBudget(), redis);

    await expect(service.checkThresholds(MORNING)).resolves.toEqual(['disk']);
    redis.state.down = true;
    await expect(service.checkThresholds(EVENING)).resolves.toEqual([]);
    expect(events.emit).toHaveBeenCalledTimes(1);
  });

  it('says nothing while every resource is within budget', async () => {
    const { service, events } = setup(async () => reading());

    await expect(service.checkThresholds(MORNING)).resolves.toEqual([]);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('still alerts once a day when Redis is down, remembering it itself', async () => {
    const down = fakeRedis();
    down.state.down = true;
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
    const redis = fakeRedis();
    redis.state.down = true;
    const { service, events } = setup(async () => overBudget(), redis);

    await expect(service.checkThresholds(MORNING)).resolves.toEqual(['disk']);
    redis.state.down = false;
    await expect(service.checkThresholds(EVENING)).resolves.toEqual([]);

    expect(events.emit).toHaveBeenCalledTimes(1);
    // The mark reaches Redis, for the other instances.
    expect(redis.keys.has('ops:resource-alert:disk:2026-11-25')).toBe(true);
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
