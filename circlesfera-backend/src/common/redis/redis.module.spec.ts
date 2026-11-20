import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import {
  createRedisClient,
  RedisModule,
  redisConnectionOptions,
  redisRetryStrategy,
} from './redis.module.js';

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

const config = (values: Record<string, unknown>) =>
  ({ get: (k: string) => values[k] }) as unknown as ConfigService;

describe('redisConnectionOptions', () => {
  it('reads the configured host, port and password', () => {
    expect(
      redisConnectionOptions(
        config({ REDIS_HOST: 'redis', REDIS_PORT: 6380, REDIS_PASSWORD: 'pw' }),
      ),
    ).toEqual({ host: 'redis', port: 6380, password: 'pw' });
  });

  it('defaults to a local Redis without a password', () => {
    expect(redisConnectionOptions(config({ REDIS_PASSWORD: '' }))).toEqual({
      host: 'localhost',
      port: 6379,
      password: undefined,
    });
  });
});

describe('redisRetryStrategy', () => {
  it('waits 50 ms more each try, up to 2 seconds', () => {
    expect(redisRetryStrategy(1)).toBe(50);
    expect(redisRetryStrategy(10)).toBe(500);
    expect(redisRetryStrategy(100)).toBe(2000);
  });
});

describe('createRedisClient', () => {
  it('connects where the configuration says, retrying, and logs connection errors', () => {
    createRedisClient(
      config({ REDIS_HOST: 'redis', REDIS_PORT: 6380, REDIS_PASSWORD: 'pw' }),
    );

    const instance = redisInstances.at(-1)!;
    expect(instance.options).toMatchObject({
      host: 'redis',
      port: 6380,
      password: 'pw',
      maxRetriesPerRequest: 3,
      retryStrategy: redisRetryStrategy,
    });
    const onError = instance.on.mock.calls.find((c) => c[0] === 'error')![1];
    expect(() => onError(new Error('refused'))).not.toThrow();
  });
});

describe('RedisModule', () => {
  it('closes the shared connection when the application shuts down', async () => {
    const redis = {
      quit: vi.fn().mockResolvedValue('OK'),
      disconnect: vi.fn(),
    };
    await new RedisModule(redis as never).onApplicationShutdown();
    expect(redis.quit).toHaveBeenCalled();
    expect(redis.disconnect).not.toHaveBeenCalled();
  });

  it('drops the connection if Redis is already gone', async () => {
    const redis = {
      quit: vi.fn().mockRejectedValue(new Error('closed')),
      disconnect: vi.fn(),
    };
    await expect(
      new RedisModule(redis as never).onApplicationShutdown(),
    ).resolves.toBeUndefined();
    expect(redis.disconnect).toHaveBeenCalled();
  });
});
