import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  getRegisterQueueOptions,
  QUEUE_NAMES,
} from '../common/constants/queue-policy.constants.js';
import { registerRecurringJob } from '../common/queues/recurring-jobs.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ClickHouseLoadService } from './clickhouse-load.service.js';
import { WarehouseExportProcessor } from './processors/warehouse-export.processor.js';
import { WarehouseExportService } from './warehouse-export.service.js';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue(
      getRegisterQueueOptions(QUEUE_NAMES.WAREHOUSE_EXPORT),
    ),
  ],
  providers: [
    WarehouseExportService,
    ClickHouseLoadService,
    WarehouseExportProcessor,
  ],
  exports: [WarehouseExportService],
})
export class WarehouseModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(WarehouseModule.name);

  constructor(
    @InjectQueue('warehouse-export') private readonly warehouseQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    await registerRecurringJob(
      this.warehouseQueue,
      'warehouse_analytics_export_cron',
      'nightly-analytics-export',
      '30 3 * * *',
    );
    this.logger.log(
      'Registered repeatable job: nightly-analytics-export (30 3 * * *)',
    );
  }
}
