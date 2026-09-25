import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheckError, type HealthIndicatorResult } from '@nestjs/terminus';
import { Redis } from 'ioredis';

// Pings Redis directly with ioredis (already a dependency for BullMQ and the
// Socket.IO adapter) rather than through @nestjs/terminus's
// MicroserviceHealthIndicator, which exists to verify an actual NestJS
// microservice transport endpoint is reachable — this app has none; it was
// only ever used to open a raw Redis connection (ARCH-002).
@Injectable()
export class RedisHealthIndicator {
  constructor(@Inject(ConfigService) private configService: ConfigService) {}

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    const redisHost =
      this.configService.get<string>('REDIS_HOST') || 'localhost';
    const redisPort = this.configService.get<number>('REDIS_PORT') || 6379;
    const redisPassword =
      this.configService.get<string>('REDIS_PASSWORD') || undefined;

    const client = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
    });

    try {
      await client.connect();
      await client.ping();
      return { [key]: { status: 'up' } };
    } catch (error) {
      throw new HealthCheckError(`${key} check failed`, {
        [key]: {
          status: 'down',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      client.disconnect();
    }
  }
}
