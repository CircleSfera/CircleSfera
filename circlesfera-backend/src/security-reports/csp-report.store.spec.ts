import { describe, expect, it, vi } from 'vitest';
import {
  CSP_REPORT_RETENTION_DAYS,
  CSP_SUMMARY_MAX_ROWS,
  CspReportStore,
  cspReportKey,
} from './csp-report.store.js';

function fakeRedis() {
  const tx = {
    hincrby: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };
  return {
    tx,
    redis: { multi: vi.fn(() => tx) },
  };
}

const violation = {
  disposition: 'report',
  directive: 'img-src',
  blocked: 'https://cdn.example.com',
  page: '/ana',
};

describe('CspReportStore', () => {
  it('counts each violation by day, disposition, directive and origin, never the page', async () => {
    const { tx, redis } = fakeRedis();
    const store = new CspReportStore(redis as never);

    await store.record([violation, { ...violation, directive: 'script-src' }]);

    const key = cspReportKey();
    expect(key).toMatch(/^csp:reports:\d{4}-\d{2}-\d{2}$/);
    expect(tx.hincrby).toHaveBeenCalledWith(
      key,
      'report|img-src|https://cdn.example.com',
      1,
    );
    expect(tx.hincrby).toHaveBeenCalledWith(
      key,
      'report|script-src|https://cdn.example.com',
      1,
    );
    expect(JSON.stringify(tx.hincrby.mock.calls)).not.toContain('/ana');
    expect(tx.expire).toHaveBeenCalledWith(
      key,
      CSP_REPORT_RETENTION_DAYS * 86400,
    );
  });

  it('does nothing without violations and never throws when Redis fails', async () => {
    const { tx, redis } = fakeRedis();
    const store = new CspReportStore(redis as never);

    await store.record([]);
    expect(redis.multi).not.toHaveBeenCalled();

    tx.exec.mockRejectedValue(new Error('redis down'));
    await expect(store.record([violation])).resolves.toBeUndefined();
  });

  it('adds up the counters of every day, the most frequent first', async () => {
    const hashes: Record<string, Record<string, string>> = {
      'csp:reports:2026-11-02': {
        'report|img-src|https://cdn.example.com': '3',
        'report|script-src|inline': '1',
      },
      'csp:reports:2026-11-01': {
        'report|img-src|https://cdn.example.com': '2',
        // An origin that carries the separator keeps it.
        'enforce|connect-src|wss://a|b': '4',
      },
    };
    const redis = {
      scan: vi
        .fn()
        .mockResolvedValueOnce(['7', ['csp:reports:2026-11-02']])
        .mockResolvedValueOnce([
          '0',
          ['csp:reports:2026-11-01', 'csp:reports:2026-11-02'],
        ]),
      hgetall: vi.fn(async (key: string) => hashes[key]),
    };
    const store = new CspReportStore(redis as never);

    const summary = await store.summary();

    expect(redis.scan).toHaveBeenNthCalledWith(
      2,
      '7',
      'MATCH',
      'csp:reports:*',
      'COUNT',
      100,
    );
    expect(summary).toEqual({
      days: 2,
      firstDay: '2026-11-01',
      lastDay: '2026-11-02',
      total: 10,
      rows: [
        {
          count: 5,
          disposition: 'report',
          directive: 'img-src',
          blocked: 'https://cdn.example.com',
        },
        {
          count: 4,
          disposition: 'enforce',
          directive: 'connect-src',
          blocked: 'wss://a|b',
        },
        {
          count: 1,
          disposition: 'report',
          directive: 'script-src',
          blocked: 'inline',
        },
      ],
    });
  });

  it('lists at most the most frequent rows and says when there is none', async () => {
    const many = Object.fromEntries(
      Array.from({ length: CSP_SUMMARY_MAX_ROWS + 5 }, (_, i) => [
        `report|img-src|https://o${i}.example.com`,
        String(i + 1),
      ]),
    );
    const store = new CspReportStore({
      scan: vi.fn().mockResolvedValue(['0', ['csp:reports:2026-11-01']]),
      hgetall: vi.fn().mockResolvedValue(many),
    } as never);

    const summary = await store.summary();
    expect(summary.rows).toHaveLength(CSP_SUMMARY_MAX_ROWS);
    expect(summary.rows[0].count).toBe(CSP_SUMMARY_MAX_ROWS + 5);

    const empty = new CspReportStore({
      scan: vi.fn().mockResolvedValue(['0', []]),
      hgetall: vi.fn(),
    } as never);
    await expect(empty.summary()).resolves.toEqual({
      days: 0,
      firstDay: null,
      lastDay: null,
      total: 0,
      rows: [],
    });
  });

  it('fails rather than report no violations when Redis cannot be read', async () => {
    const store = new CspReportStore({
      scan: vi.fn().mockRejectedValue(new Error('redis down')),
    } as never);

    await expect(store.summary()).rejects.toThrow('redis down');
  });

  it('keys counters by UTC day', () => {
    expect(cspReportKey(new Date('2026-10-06T23:30:00Z'))).toBe(
      'csp:reports:2026-10-06',
    );
  });
});
