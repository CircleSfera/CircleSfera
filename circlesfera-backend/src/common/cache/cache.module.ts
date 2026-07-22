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
        const host = configService.get<string>('REDIS_HOST') || 'localhost';
        const port = configService.get<number>('REDIS_PORT') || 6379;
        const password = configService.get<string>('REDIS_PASSWORD');
        const auth = password ? `:${encodeURIComponent(password)}@` : '';
        const url = `redis://${auth}${host}:${port}`;

        const keyv = createKeyv(url);

        keyv.on('error', (err: { message?: string }) => {
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
