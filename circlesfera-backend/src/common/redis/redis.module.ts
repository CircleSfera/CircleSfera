import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis, type RedisOptions } from 'ioredis';

// The one Redis connection the services share for their commands (counters,
// feed inboxes, limits). Inject it with @Inject(REDIS_CLIENT).
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

// Where Redis is (REDIS_HOST, REDIS_PORT, REDIS_PASSWORD). Every connection
// takes it from here, those that cannot share the client included: the
// socket.io pub/sub pair, BullMQ, the cache store and the health ping.
export function redisConnectionOptions(
  config: ConfigService,
): Pick<RedisOptions, 'host' | 'port' | 'password'> {
  return {
    host: config.get<string>('REDIS_HOST') || 'localhost',
    port: config.get<number>('REDIS_PORT') || 6379,
    password: config.get<string>('REDIS_PASSWORD') || undefined,
  };
}

// Reconnects quickly at first, then every 2 seconds at most.
export function redisRetryStrategy(times: number): number {
  return Math.min(times * 50, 2000);
}

export function createRedisClient(config: ConfigService): Redis {
  const logger = new Logger('Redis');
  const client = new Redis({
    ...redisConnectionOptions(config),
    retryStrategy: redisRetryStrategy,
    maxRetriesPerRequest: 3,
  });
  client.on('error', (err) => {
    logger.error(`Redis connection error: ${err.message}`);
  });
  return client;
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: createRedisClient,
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // After every module's onModuleDestroy, so no service still needs it.
  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
