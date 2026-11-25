import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../common/redis/redis.module.js';
import {
  type ServerResources,
  ServerResourcesService,
} from './server-resources.service.js';

/** The resources the health check watches and nothing escalated before. */
export type ResourceAlertKey =
  | 'disk'
  | 'heap'
  | 'rss'
  | 'database_unreachable'
  | 'redis_unreachable';

export interface ResourceAlert {
  key: ResourceAlertKey;
  message: string;
}

const GIB = 1024 * 1024 * 1024;
// A day's mark outlives the day, whatever the time zone of the reader.
const MARK_TTL_SECONDS = 2 * 24 * 60 * 60;
const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;
const gib = (bytes: number) => `${(bytes / GIB).toFixed(2)} GB`;

/**
 * The ALERT thresholds of ADR-0024 crossed in one reading. Disk, RAM,
 * database and Redis had recurring detection (the health check) but no
 * escalation; these are those thresholds, the same numbers.
 */
export function crossedThresholds(resources: ServerResources): ResourceAlert[] {
  const alerts: ResourceAlert[] = [];
  const root = resources.disks.root;
  if (root && root.usedRatio >= resources.disks.alertRatio) {
    alerts.push({
      key: 'disk',
      message: `Disk of the server at ${percent(root.usedRatio)} (ADR-0024 alert at ${percent(resources.disks.alertRatio)})`,
    });
  }
  const { heapUsedBytes, heapAlertBytes, rssBytes, rssAlertBytes } =
    resources.process;
  if (heapUsedBytes >= heapAlertBytes) {
    alerts.push({
      key: 'heap',
      message: `Backend heap at ${gib(heapUsedBytes)} (ADR-0024 alert at ${gib(heapAlertBytes)})`,
    });
  }
  if (rssBytes >= rssAlertBytes) {
    alerts.push({
      key: 'rss',
      message: `Backend memory (RSS) at ${gib(rssBytes)} (ADR-0024 alert at ${gib(rssAlertBytes)})`,
    });
  }
  if (!resources.database.reachable) {
    alerts.push({
      key: 'database_unreachable',
      message: 'The database does not answer the backend',
    });
  }
  if (!resources.redis.reachable) {
    alerts.push({
      key: 'redis_unreachable',
      message: 'Redis does not answer the backend',
    });
  }
  return alerts;
}

/**
 * Tells the team, through the incident channel (Slack, ADR-0019's
 * system.incident), when a resource crosses its ADR-0024 ALERT threshold,
 * at most once per threshold per day (UTC).
 */
@Injectable()
export class ResourceAlertsService {
  private readonly logger = new Logger(ResourceAlertsService.name);
  // When Redis cannot be read, the day's alerts are remembered here.
  private readonly sentWithoutRedis = new Set<string>();

  constructor(
    @Inject(ServerResourcesService)
    private readonly resources: ServerResourcesService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async checkThresholds(now = new Date()): Promise<ResourceAlertKey[]> {
    let alerts: ResourceAlert[];
    try {
      alerts = crossedThresholds(await this.resources.collect());
    } catch (error) {
      this.logger.warn('Could not read the server resources', error);
      return [];
    }
    const day = now.toISOString().slice(0, 10);
    const sent: ResourceAlertKey[] = [];
    for (const alert of alerts) {
      if (!(await this.firstToday(alert.key, day))) continue;
      this.events.emit('system.incident', {
        message: `[Resource alert] ${alert.message}`,
        path: 'operational://resources',
        statusCode: 503,
        timestamp: now.toISOString(),
      });
      sent.push(alert.key);
    }
    return sent;
  }

  // Whether this alert has not been sent yet today. Redis keeps the mark so
  // that a restart or a second instance does not send it again; this
  // instance's own memory keeps it while Redis does not answer, and is read
  // first, so an alert sent during an outage is not sent again once Redis is
  // back.
  private async firstToday(
    key: ResourceAlertKey,
    day: string,
  ): Promise<boolean> {
    const mark = `ops:resource-alert:${key}:${day}`;
    for (const old of this.sentWithoutRedis) {
      if (!old.endsWith(`:${day}`)) this.sentWithoutRedis.delete(old);
    }
    if (this.sentWithoutRedis.has(mark)) {
      // Tell Redis too, for the other instances; it may still be down.
      await this.markInRedis(mark).catch(() => undefined);
      return false;
    }
    try {
      return (await this.markInRedis(mark)) === 'OK';
    } catch {
      this.sentWithoutRedis.add(mark);
      return true;
    }
  }

  private markInRedis(mark: string): Promise<string | null> {
    return this.redis.set(mark, '1', 'EX', MARK_TTL_SECONDS, 'NX');
  }
}
