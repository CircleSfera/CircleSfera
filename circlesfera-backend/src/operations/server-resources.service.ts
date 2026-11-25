import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../common/redis/redis.module.js';
import {
  DISK_ALERT_RATIO,
  DISK_BUDGET_PATH,
  HEAP_ALERT_BYTES,
  RSS_ALERT_BYTES,
} from '../health/resource-budgets.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Every queue of the app, for the depths the page shows. */
export const OPERATIONS_QUEUES = Symbol('OPERATIONS_QUEUES');

export interface DiskUsage {
  totalBytes: number;
  freeBytes: number;
  usedRatio: number;
}

export interface QueueDepth {
  name: string;
  // false when the queue did not answer in time: no counts then.
  reachable: boolean;
  waiting: number | null;
  active: number | null;
  delayed: number | null;
  failed: number | null;
}

export interface ServerResources {
  generatedAt: string;
  // The server as a whole: what /proc shows the container of it.
  host: {
    memoryTotalBytes: number | null;
    memoryAvailableBytes: number | null;
    loadAverage: [number, number, number];
    cpus: number;
  };
  // The backend container alone, from its own control group.
  container: {
    memoryBytes: number | null;
    memoryLimitBytes: number | null;
  };
  // The Node process, with the budgets of ADR-0024.
  process: {
    heapUsedBytes: number;
    rssBytes: number;
    heapAlertBytes: number;
    rssAlertBytes: number;
  };
  disks: {
    alertRatio: number;
    root: DiskUsage | null;
    uploads: DiskUsage | null;
  };
  database: { reachable: boolean; sizeBytes: number | null };
  redis: {
    reachable: boolean;
    usedMemoryBytes: number | null;
    peakMemoryBytes: number | null;
    // 0 when Redis has no limit of its own.
    maxMemoryBytes: number | null;
    evictedKeys: number | null;
  };
  queues: QueueDepth[];
  // What the backend container cannot see of the server.
  notVisible: string[];
}

/** What a container cannot see from inside, without the Docker socket. */
export const NOT_VISIBLE_FROM_CONTAINER = [
  'per_container_usage',
  'docker_disk_usage',
  'other_volumes',
] as const;

/** MemTotal and MemAvailable of /proc/meminfo, in bytes. */
export function parseMeminfo(text: string): {
  totalBytes: number | null;
  availableBytes: number | null;
} {
  const kib = (name: string): number | null => {
    const match = new RegExp(`^${name}:\\s+(\\d+)\\s+kB`, 'm').exec(text);
    return match ? Number(match[1]) * 1024 : null;
  };
  return { totalBytes: kib('MemTotal'), availableBytes: kib('MemAvailable') };
}

/** The fields of a Redis INFO answer, by name. */
export function parseRedisInfo(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const at = line.indexOf(':');
    if (at > 0) fields[line.slice(0, at)] = line.slice(at + 1).trim();
  }
  return fields;
}

function numberOrNull(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** How long one source may take before it is reported as not answering. */
export const SOURCE_TIMEOUT_MS = 5_000;

/** The work's answer, or a rejection once `ms` have passed without one. */
export function withinTime<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * The server's resources as far as the backend container sees them, read
 * when asked: nothing here writes, and nothing needs the Docker socket.
 * Sizes, counts and ratios only: no address, path or setting. Each source
 * has SOURCE_TIMEOUT_MS to answer: a Redis outage (BullMQ retries for
 * minutes) shows as not answering instead of stalling the page or the
 * alert job.
 */
@Injectable()
export class ServerResourcesService {
  timeoutMs = SOURCE_TIMEOUT_MS;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(OPERATIONS_QUEUES) private readonly queues: Queue[],
  ) {}

  async collect(): Promise<ServerResources> {
    const memory = process.memoryUsage();
    const [meminfo, container, root, uploads, database, redis, queues] =
      await Promise.all([
        this.readText('/proc/meminfo'),
        this.containerMemory(),
        this.disk(DISK_BUDGET_PATH),
        this.disk(path.join(process.cwd(), 'uploads')),
        this.database(),
        this.redisMemory(),
        this.queueDepths(),
      ]);
    const host = meminfo ? parseMeminfo(meminfo) : null;
    const [one, five, fifteen] = os.loadavg();

    return {
      generatedAt: new Date().toISOString(),
      host: {
        memoryTotalBytes: host?.totalBytes ?? null,
        memoryAvailableBytes: host?.availableBytes ?? null,
        loadAverage: [one, five, fifteen],
        cpus: os.availableParallelism(),
      },
      container,
      process: {
        heapUsedBytes: memory.heapUsed,
        rssBytes: memory.rss,
        heapAlertBytes: HEAP_ALERT_BYTES,
        rssAlertBytes: RSS_ALERT_BYTES,
      },
      disks: { alertRatio: DISK_ALERT_RATIO, root, uploads },
      database,
      redis,
      queues,
      notVisible: [...NOT_VISIBLE_FROM_CONTAINER],
    };
  }

  private async readText(file: string): Promise<string | null> {
    try {
      return await withinTime(
        fs.promises.readFile(file, 'utf8'),
        this.timeoutMs,
      );
    } catch {
      return null;
    }
  }

  // cgroup v2: memory.current, and memory.max ("max" when unlimited).
  private async containerMemory(): Promise<ServerResources['container']> {
    const [current, max] = await Promise.all([
      this.readText('/sys/fs/cgroup/memory.current'),
      this.readText('/sys/fs/cgroup/memory.max'),
    ]);
    return {
      memoryBytes: numberOrNull(current?.trim()),
      memoryLimitBytes: numberOrNull(max?.trim()),
    };
  }

  private async disk(folder: string): Promise<DiskUsage | null> {
    try {
      const stats = await withinTime(
        fs.promises.statfs(folder),
        this.timeoutMs,
      );
      const totalBytes = stats.blocks * stats.bsize;
      const freeBytes = stats.bavail * stats.bsize;
      if (totalBytes <= 0) return null;
      return {
        totalBytes,
        freeBytes,
        usedRatio: (totalBytes - freeBytes) / totalBytes,
      };
    } catch {
      return null;
    }
  }

  private async database(): Promise<ServerResources['database']> {
    try {
      const [row] = await withinTime(
        this.prisma.$queryRaw<{ size: bigint }[]>`
          SELECT pg_database_size(current_database()) AS size
        `,
        this.timeoutMs,
      );
      return { reachable: true, sizeBytes: Number(row?.size ?? 0) };
    } catch {
      return { reachable: false, sizeBytes: null };
    }
  }

  private async redisMemory(): Promise<ServerResources['redis']> {
    try {
      const [memory, stats] = await withinTime(
        Promise.all([this.redis.info('memory'), this.redis.info('stats')]),
        this.timeoutMs,
      );
      const fields = { ...parseRedisInfo(memory), ...parseRedisInfo(stats) };
      return {
        reachable: true,
        usedMemoryBytes: numberOrNull(fields.used_memory),
        peakMemoryBytes: numberOrNull(fields.used_memory_peak),
        maxMemoryBytes: numberOrNull(fields.maxmemory),
        evictedKeys: numberOrNull(fields.evicted_keys),
      };
    } catch {
      return {
        reachable: false,
        usedMemoryBytes: null,
        peakMemoryBytes: null,
        maxMemoryBytes: null,
        evictedKeys: null,
      };
    }
  }

  // A queue that does not answer in time is listed with no counts.
  private async queueDepths(): Promise<QueueDepth[]> {
    const depths = await Promise.all(
      this.queues.map(async (queue): Promise<QueueDepth> => {
        try {
          const counts = await withinTime(
            queue.getJobCounts('waiting', 'active', 'delayed', 'failed'),
            this.timeoutMs,
          );
          return {
            name: queue.name,
            reachable: true,
            waiting: counts.waiting ?? 0,
            active: counts.active ?? 0,
            delayed: counts.delayed ?? 0,
            failed: counts.failed ?? 0,
          };
        } catch {
          return {
            name: queue.name,
            reachable: false,
            waiting: null,
            active: null,
            delayed: null,
            failed: null,
          };
        }
      }),
    );
    return depths.sort((a, b) => a.name.localeCompare(b.name));
  }
}
