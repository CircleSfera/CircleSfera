import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { Redis } from 'ioredis';

// Pings Redis directly with ioredis (already a dependency for BullMQ and the
// Socket.IO adapter) rather than through @nestjs/terminus's
// MicroserviceHealthIndicator, which exists to verify an actual NestJS
// microservice transport endpoint is reachable — this app has none; it was
// only ever used to open a raw Redis connection. A failed ping is reported
// as `down` (HealthCheckService then answers 503), not thrown.
@Injectable()
export class RedisHealthIndicator {
  constructor(
    @Inject(ConfigService) private configService: ConfigService,
    @Inject(HealthIndicatorService)
    private readonly healthIndicator: HealthIndicatorService,
  ) {}

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
      // connectTimeout only bounds the initial TCP handshake; without this,
      // an accepted connection where Redis never replies to PING (e.g. an
      // overloaded instance) would hang the command indefinitely, and with
      // it the whole /health or /health/readiness response.
      commandTimeout: 3000,
    });

    const indicator = this.healthIndicator.check(key);
    try {
      await client.connect();
      await client.ping();
      return indicator.up();
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      client.disconnect();
    }
  }
}
