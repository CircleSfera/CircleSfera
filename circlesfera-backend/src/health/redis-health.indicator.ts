import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { Redis } from 'ioredis';
import { redisConnectionOptions } from '../common/redis/redis.module.js';

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
    // A connection of its own, opened for each ping: it proves Redis answers
    // now, which the shared client, queueing commands while it reconnects,
    // would not.
    const client = new Redis({
      ...redisConnectionOptions(this.configService),
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
