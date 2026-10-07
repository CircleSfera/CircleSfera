import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type Provider,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { CspViolationSummary } from './csp-report.util.js';

export const CSP_REPORT_REDIS = Symbol('CSP_REPORT_REDIS');

// Days of daily counters kept, enough to judge the policy before enforcing it.
export const CSP_REPORT_RETENTION_DAYS = 35;

export const cspReportRedisProvider: Provider = {
  provide: CSP_REPORT_REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const logger = new Logger('CspReportRedis');
    const client = new Redis({
      host: config.get<string>('REDIS_HOST') || 'localhost',
      port: config.get<number>('REDIS_PORT') || 6379,
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
    });
    client.on('error', (err) => {
      logger.error(`Redis connection error: ${err.message}`);
    });
    return client;
  },
};

// Daily key for the counters, by UTC day.
export function cspReportKey(at: Date = new Date()): string {
  return `csp:reports:${at.toISOString().slice(0, 10)}`;
}

// Counts CSP violations per day by disposition, directive and blocked origin,
// so the summary survives deploys (container logs do not). The page path is
// never stored: it can contain a username.
@Injectable()
export class CspReportStore implements OnModuleDestroy {
  private readonly logger = new Logger(CspReportStore.name);

  constructor(@Inject(CSP_REPORT_REDIS) private readonly redis: Redis) {}

  async record(violations: CspViolationSummary[]): Promise<void> {
    if (violations.length === 0) return;
    const key = cspReportKey();
    try {
      const tx = this.redis.multi();
      for (const v of violations) {
        tx.hincrby(key, `${v.disposition}|${v.directive}|${v.blocked}`, 1);
      }
      tx.expire(key, CSP_REPORT_RETENTION_DAYS * 24 * 60 * 60);
      await tx.exec();
    } catch (e) {
      // Reporting must never fail a browser request.
      this.logger.warn(`Could not count CSP reports: ${String(e)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
