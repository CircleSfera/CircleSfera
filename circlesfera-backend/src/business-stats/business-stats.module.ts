import { Module } from '@nestjs/common';
import { BusinessStatsController } from './business-stats.controller.js';
import { BusinessStatsService } from './business-stats.service.js';

@Module({
  controllers: [BusinessStatsController],
  providers: [BusinessStatsService],
  exports: [BusinessStatsService],
})
export class BusinessStatsModule {}
