import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';
import { AnalyticsProcessor } from './processors/analytics.processor.js';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({
      name: 'analytics-processing',
    }),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsProcessor],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
