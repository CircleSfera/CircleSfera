import { describe, expect, it, vi } from 'vitest';
import {
  CSP_REPORT_RETENTION_DAYS,
  CspReportStore,
  cspReportKey,
  cspReportRedisProvider,
} from './csp-report.store.js';

const redisInstances: Array<{
  options: Record<string, unknown>;
  on: ReturnType<typeof vi.fn>;
}> = [];
vi.mock('ioredis', () => ({
  Redis: vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    options: Record<string, unknown>,
  ) {
    this.options = options;
    this.on = vi.fn();
    redisInstances.push(this as never);
  }),
}));

function fakeRedis() {
  const tx = {
    hincrby: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };
  return {
    tx,
    redis: { multi: vi.fn(() => tx), quit: vi.fn().mockResolvedValue('OK') },
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

  it('closes its connection on shutdown, even if Redis is gone', async () => {
    const { redis } = fakeRedis();
    await new CspReportStore(redis as never).onModuleDestroy();
    expect(redis.quit).toHaveBeenCalled();

    redis.quit.mockRejectedValueOnce(new Error('closed'));
    await expect(
      new CspReportStore(redis as never).onModuleDestroy(),
    ).resolves.toBeUndefined();
  });

  it('keys counters by UTC day', () => {
    expect(cspReportKey(new Date('2026-10-06T23:30:00Z'))).toBe(
      'csp:reports:2026-10-06',
    );
  });
});

describe('cspReportRedisProvider', () => {
  const factory = (
    cspReportRedisProvider as { useFactory: (c: unknown) => unknown }
  ).useFactory;

  it('connects with the configured host, port and password', () => {
    const values: Record<string, unknown> = {
      REDIS_HOST: 'redis',
      REDIS_PORT: 6380,
      REDIS_PASSWORD: 'pw',
    };
    factory({ get: (k: string) => values[k] });

    const { options } = redisInstances.at(-1)!;
    expect(options).toMatchObject({
      host: 'redis',
      port: 6380,
      password: 'pw',
    });
    expect((options.retryStrategy as (n: number) => number)(100)).toBe(2000);
  });

  it('defaults to a local Redis and logs connection errors', () => {
    factory({ get: () => undefined });

    const instance = redisInstances.at(-1)!;
    expect(instance.options).toMatchObject({
      host: 'localhost',
      port: 6379,
      password: undefined,
    });
    const onError = instance.on.mock.calls.find((c) => c[0] === 'error')![1];
    expect(() => onError(new Error('refused'))).not.toThrow();
  });
});
