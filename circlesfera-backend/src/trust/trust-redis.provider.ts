import { Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

export const TRUST_REDIS = Symbol('TRUST_REDIS');

// Redis connection for spam and bot protection counters.
export const trustRedisProvider: Provider = {
  provide: TRUST_REDIS,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const logger = new Logger('TrustRedis');
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
