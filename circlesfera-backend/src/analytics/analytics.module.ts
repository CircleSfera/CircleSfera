import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  getRegisterQueueOptions,
  QUEUE_NAMES,
} from '../common/constants/queue-policy.constants.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';
import { AnalyticsProcessor } from './processors/analytics.processor.js';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue(
      getRegisterQueueOptions(QUEUE_NAMES.ANALYTICS_PROCESSING),
    ),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsProcessor],
  exports: [AnalyticsService],
})
export class AnalyticsModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(AnalyticsModule.name);

  constructor(
    @InjectQueue('analytics-processing') private readonly analyticsQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    await this.analyticsQueue.add(
      'daily-aggregation',
      {},
      {
        repeat: { pattern: '0 0 * * *' }, // EVERY_DAY_AT_MIDNIGHT
        jobId: 'daily_aggregation_cron',
      },
    );
    this.logger.log('Registered repeatable job: daily-aggregation (0 0 * * *)');
  }
}
