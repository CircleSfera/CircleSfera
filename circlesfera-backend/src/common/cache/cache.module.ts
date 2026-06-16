import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-redis-yet';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const store = await redisStore({
          url: `redis://${configService.get<string>('REDIS_HOST') || 'localhost'}:${configService.get<number>('REDIS_PORT') || 6379}`,
          ttl: 600000, // 10 minutes
        });

        if (store.client) {
          store.client.on('error', (err) => {
            console.error('Redis cache error (prevented crash):', err.message || err);
          });
        }

        return { store };
      },
    }),
  ],
  exports: [CacheModule],
})
export class RedisCacheModule {}
