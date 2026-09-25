import type { ConfigService } from '@nestjs/config';
import { HealthCheckError } from '@nestjs/terminus';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisHealthIndicator } from './redis-health.indicator.js';

const mockConnect = vi.fn();
const mockPing = vi.fn();
const mockDisconnect = vi.fn();
let lastConstructorOptions: any;

vi.mock('ioredis', () => {
  return {
    Redis: vi.fn().mockImplementation(function (this: any, opts: any) {
      lastConstructorOptions = opts;
      this.connect = mockConnect;
      this.ping = mockPing;
      this.disconnect = mockDisconnect;
    }),
  };
});

describe('RedisHealthIndicator', () => {
  let indicator: RedisHealthIndicator;

  const defaultConfigImpl = (key: string) => {
    if (key === 'REDIS_HOST') return 'redis.internal';
    if (key === 'REDIS_PORT') return 6380;
    if (key === 'REDIS_PASSWORD') return 'secret';
    return undefined;
  };

  const mockConfigService = {
    get: vi.fn(defaultConfigImpl),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks() only resets call history, not overrides installed via
    // mockReturnValue/mockImplementation in a previous test — restore the
    // default explicitly so tests don't depend on execution order.
    mockConfigService.get.mockImplementation(defaultConfigImpl);
    indicator = new RedisHealthIndicator(
      mockConfigService as unknown as ConfigService,
    );
    mockConnect.mockResolvedValue(undefined);
    mockPing.mockResolvedValue('PONG');
  });

  it('connects with the configured host, port, and password', async () => {
    await indicator.pingCheck('redis');

    expect(lastConstructorOptions).toEqual(
      expect.objectContaining({
        host: 'redis.internal',
        port: 6380,
        password: 'secret',
        lazyConnect: true,
      }),
    );
  });

  it('falls back to default host/port and omits password when unset', async () => {
    mockConfigService.get.mockReturnValue(undefined);

    await indicator.pingCheck('redis');

    expect(lastConstructorOptions).toEqual(
      expect.objectContaining({
        host: 'localhost',
        port: 6379,
        password: undefined,
      }),
    );
  });

  it('returns status up and disconnects on a successful ping', async () => {
    const result = await indicator.pingCheck('redis');

    expect(result).toEqual({ redis: { status: 'up' } });
    expect(mockConnect).toHaveBeenCalled();
    expect(mockPing).toHaveBeenCalled();
    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('throws HealthCheckError with status down and disconnects on failure', async () => {
    mockConnect.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(indicator.pingCheck('redis')).rejects.toThrow(
      HealthCheckError,
    );
    expect(mockDisconnect).toHaveBeenCalled();
  });
});
