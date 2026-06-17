import { createKeyv } from '@keyv/redis';
import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const url = `redis://${configService.get<string>('REDIS_HOST') || 'localhost'}:${configService.get<number>('REDIS_PORT') || 6379}`;

        const keyv = createKeyv(url);

        keyv.on('error', (err: any) => {
          console.error(
            'Redis cache error (prevented crash):',
            err.message || err,
          );
        });

        return {
          stores: [keyv],
          ttl: 600000, // 10 minutes
        };
      },
    }),
  ],
  exports: [CacheModule],
})
export class RedisCacheModule {}
