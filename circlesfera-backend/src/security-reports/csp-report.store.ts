import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../common/redis/redis.module.js';
import type { CspViolationSummary } from './csp-report.util.js';

// Days of daily counters kept, enough to judge the policy before enforcing it.
export const CSP_REPORT_RETENTION_DAYS = 35;

// Daily key for the counters, by UTC day.
export function cspReportKey(at: Date = new Date()): string {
  return `csp:reports:${at.toISOString().slice(0, 10)}`;
}

// Counts CSP violations per day by disposition, directive and blocked origin,
// so the summary survives deploys (container logs do not). The page path is
// never stored: it can contain a username.
@Injectable()
export class CspReportStore {
  private readonly logger = new Logger(CspReportStore.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

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
}
