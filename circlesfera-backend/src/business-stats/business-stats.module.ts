import { Module } from '@nestjs/common';
import { BusinessStatsController } from './business-stats.controller.js';
import { BusinessStatsService } from './business-stats.service.js';
import { businessStatsRedisProvider } from './business-stats-redis.provider.js';

@Module({
  controllers: [BusinessStatsController],
  providers: [BusinessStatsService, businessStatsRedisProvider],
  exports: [BusinessStatsService],
})
export class BusinessStatsModule {}
