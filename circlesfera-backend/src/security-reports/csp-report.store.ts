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

// The most rows the summary lists, the most frequent first.
export const CSP_SUMMARY_MAX_ROWS = 60;

export interface CspSummaryRow {
  count: number;
  disposition: string;
  directive: string;
  blocked: string;
}

export interface CspSummary {
  // Days with at least one report, and the first and last of them.
  days: number;
  firstDay: string | null;
  lastDay: string | null;
  total: number;
  rows: CspSummaryRow[];
}

// Counts CSP violations per day by disposition, directive and blocked origin,
// so the summary survives deploys (container logs do not). The page path is
// never stored: it can contain a username.
@Injectable()
export class CspReportStore {
  private readonly logger = new Logger(CspReportStore.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // What the counters of the last days add up to, by disposition, directive
  // and blocked origin. A failed read throws: it must never read as no
  // violations.
  // The keys are known (one per UTC day of the retention), so they are read
  // directly, never found by scanning the keyspace.
  async summary(now: Date = new Date()): Promise<CspSummary> {
    const keys = Array.from({ length: CSP_REPORT_RETENTION_DAYS }, (_, i) =>
      cspReportKey(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)),
    ).reverse();
    const hashes = await Promise.all(
      keys.map((key) => this.redis.hgetall(key)),
    );

    const days: string[] = [];
    const counts = new Map<string, number>();
    keys.forEach((key, i) => {
      const fields = Object.entries(hashes[i] ?? {});
      if (fields.length === 0) return;
      days.push(key);
      for (const [field, value] of fields) {
        counts.set(field, (counts.get(field) ?? 0) + Number(value));
      }
    });

    const rows = [...counts.entries()]
      .map(([field, count]) => {
        const [disposition = '', directive = '', ...blocked] = field.split('|');
        return { count, disposition, directive, blocked: blocked.join('|') };
      })
      .sort((a, b) => b.count - a.count);

    return {
      days: days.length,
      firstDay: days.length > 0 ? days[0].slice('csp:reports:'.length) : null,
      lastDay:
        days.length > 0
          ? days[days.length - 1].slice('csp:reports:'.length)
          : null,
      total: rows.reduce((sum, row) => sum + row.count, 0),
      rows: rows.slice(0, CSP_SUMMARY_MAX_ROWS),
    };
  }

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
