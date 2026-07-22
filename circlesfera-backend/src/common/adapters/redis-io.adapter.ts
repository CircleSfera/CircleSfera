import { type INestApplicationContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor!: ReturnType<typeof createAdapter>;
  private readonly logger = new Logger(RedisIoAdapter.name);

  constructor(
    app: INestApplicationContext,
    private readonly configService: ConfigService,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const host = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const port = this.configService.get<number>('REDIS_PORT') || 6379;

    this.logger.log(`Connecting to Redis for WebSockets at ${host}:${port}...`);

    const password =
      this.configService.get<string>('REDIS_PASSWORD') || undefined;

    const pubClient = new Redis({
      host,
      port,
      password,
      lazyConnect: true,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    const subClient = pubClient.duplicate();

    try {
      await Promise.all([pubClient.connect(), subClient.connect()]);
      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.logger.log('✅ Redis IoAdapter successfully initialized.');
    } catch (error) {
      this.logger.error(
        `❌ Redis connection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.logger.warn(
        'Scaling capabilities for WebSockets will be limited until Redis is available.',
      );
    }
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
      this.logger.debug('Redis adapter attached to IO server.');
    }
    return server;
  }
}
