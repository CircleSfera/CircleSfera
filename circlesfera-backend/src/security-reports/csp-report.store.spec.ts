import { describe, expect, it, vi } from 'vitest';
import {
  CSP_REPORT_RETENTION_DAYS,
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

  it('keys counters by UTC day', () => {
    expect(cspReportKey(new Date('2026-10-06T23:30:00Z'))).toBe(
      'csp:reports:2026-10-06',
    );
  });
});
