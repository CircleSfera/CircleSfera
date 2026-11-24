import * as fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:os')>()),
  loadavg: () => [0.5, 0.75, 1],
  availableParallelism: () => 4,
}));

import {
  DISK_ALERT_RATIO,
  HEAP_ALERT_BYTES,
  RSS_ALERT_BYTES,
} from '../health/resource-budgets.js';
import {
  NOT_VISIBLE_FROM_CONTAINER,
  parseMeminfo,
  parseRedisInfo,
  ServerResourcesService,
} from './server-resources.service.js';

const MEMINFO = [
  'MemTotal:        8000000 kB',
  'MemFree:          500000 kB',
  'MemAvailable:    3000000 kB',
].join('\n');

const REDIS_MEMORY = [
  '# Memory',
  'used_memory:1048576',
  'used_memory_peak:2097152',
  'maxmemory:0',
  '',
].join('\r\n');
const REDIS_STATS = ['# Stats', 'evicted_keys:7', ''].join('\r\n');

function queue(name: string, counts: object | Error) {
  return {
    name,
    getJobCounts: vi.fn(async () => {
      if (counts instanceof Error) throw counts;
      return counts;
    }),
  };
}

function service({
  database = vi.fn().mockResolvedValue([{ size: 123456789n }]),
  info = vi.fn(async (section: string) =>
    section === 'memory' ? REDIS_MEMORY : REDIS_STATS,
  ),
  queues = [
    queue('video-transcoding', {
      waiting: 2,
      active: 1,
      delayed: 0,
      failed: 3,
    }),
    queue('ai-processing', {}),
  ],
}: {
  database?: ReturnType<typeof vi.fn>;
  info?: ReturnType<typeof vi.fn>;
  queues?: ReturnType<typeof queue>[];
} = {}) {
  return new ServerResourcesService(
    { $queryRaw: database } as never,
    { info } as never,
    queues as never,
  );
}

function fakeFiles(files: Record<string, string>) {
  vi.spyOn(fs.promises, 'readFile').mockImplementation((async (
    file: string,
  ) => {
    if (file in files) return files[file];
    throw Object.assign(new Error('missing'), { code: 'ENOENT' });
  }) as never);
}

describe('ServerResourcesService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the server, the container, the process, the disks, the database, Redis and the queues', async () => {
    fakeFiles({
      '/proc/meminfo': MEMINFO,
      '/sys/fs/cgroup/memory.current': '524288000\n',
      '/sys/fs/cgroup/memory.max': 'max\n',
    });
    const statfs = vi
      .spyOn(fs.promises, 'statfs')
      .mockResolvedValue({ bsize: 4096, blocks: 1000, bavail: 250 } as never);

    const resources = await service().collect();

    expect(resources.host).toEqual({
      memoryTotalBytes: 8000000 * 1024,
      memoryAvailableBytes: 3000000 * 1024,
      loadAverage: [0.5, 0.75, 1],
      cpus: 4,
    });
    expect(resources.container).toEqual({
      memoryBytes: 524288000,
      memoryLimitBytes: null,
    });
    expect(resources.process.heapAlertBytes).toBe(HEAP_ALERT_BYTES);
    expect(resources.process.rssAlertBytes).toBe(RSS_ALERT_BYTES);
    expect(resources.process.rssBytes).toBeGreaterThan(0);
    expect(statfs).toHaveBeenCalledWith('/');
    expect(resources.disks).toEqual({
      alertRatio: DISK_ALERT_RATIO,
      root: { totalBytes: 4096000, freeBytes: 1024000, usedRatio: 0.75 },
      uploads: { totalBytes: 4096000, freeBytes: 1024000, usedRatio: 0.75 },
    });
    expect(resources.database).toEqual({
      reachable: true,
      sizeBytes: 123456789,
    });
    expect(resources.redis).toEqual({
      reachable: true,
      usedMemoryBytes: 1048576,
      peakMemoryBytes: 2097152,
      maxMemoryBytes: 0,
      evictedKeys: 7,
    });
    // Sorted by name; a count the queue does not give is 0.
    expect(resources.queues).toEqual([
      { name: 'ai-processing', waiting: 0, active: 0, delayed: 0, failed: 0 },
      {
        name: 'video-transcoding',
        waiting: 2,
        active: 1,
        delayed: 0,
        failed: 3,
      },
    ]);
    expect(resources.notVisible).toEqual([...NOT_VISIBLE_FROM_CONTAINER]);
  });

  it('says what it could not read rather than inventing it', async () => {
    fakeFiles({});
    vi.spyOn(fs.promises, 'statfs')
      .mockRejectedValueOnce(new Error('no such folder'))
      .mockResolvedValueOnce({ bsize: 4096, blocks: 0, bavail: 0 } as never);

    const resources = await service({
      database: vi.fn().mockRejectedValue(new Error('down')),
      info: vi.fn().mockRejectedValue(new Error('down')),
      queues: [queue('feed-fanout', new Error('down'))],
    }).collect();

    expect(resources.host.memoryTotalBytes).toBeNull();
    expect(resources.host.memoryAvailableBytes).toBeNull();
    expect(resources.container).toEqual({
      memoryBytes: null,
      memoryLimitBytes: null,
    });
    expect(resources.disks.root).toBeNull();
    expect(resources.disks.uploads).toBeNull();
    expect(resources.database).toEqual({ reachable: false, sizeBytes: null });
    expect(resources.redis).toEqual({
      reachable: false,
      usedMemoryBytes: null,
      peakMemoryBytes: null,
      maxMemoryBytes: null,
      evictedKeys: null,
    });
    expect(resources.queues).toEqual([]);
  });

  it('counts an empty database as zero bytes', async () => {
    fakeFiles({});
    vi.spyOn(fs.promises, 'statfs').mockRejectedValue(new Error('none'));

    const resources = await service({
      database: vi.fn().mockResolvedValue([]),
    }).collect();

    expect(resources.database).toEqual({ reachable: true, sizeBytes: 0 });
  });
});

describe('the readers of /proc and of Redis', () => {
  it('reads MemTotal and MemAvailable in bytes, and null when absent', () => {
    expect(parseMeminfo(MEMINFO)).toEqual({
      totalBytes: 8000000 * 1024,
      availableBytes: 3000000 * 1024,
    });
    expect(parseMeminfo('')).toEqual({
      totalBytes: null,
      availableBytes: null,
    });
  });

  it('reads the fields of INFO, without its headings', () => {
    expect(parseRedisInfo(REDIS_MEMORY)).toEqual({
      used_memory: '1048576',
      used_memory_peak: '2097152',
      maxmemory: '0',
    });
    expect(parseRedisInfo('not a field\n:empty name')).toEqual({});
  });
});
