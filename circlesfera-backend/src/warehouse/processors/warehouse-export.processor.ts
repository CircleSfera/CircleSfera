import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import {
  getWorkerOptions,
  QUEUE_NAMES,
} from '../../common/constants/queue-policy.constants.js';
import { WarehouseExportService } from '../warehouse-export.service.js';

@Processor(
  QUEUE_NAMES.WAREHOUSE_EXPORT,
  getWorkerOptions(QUEUE_NAMES.WAREHOUSE_EXPORT),
)
export class WarehouseExportProcessor extends WorkerHost {
  private readonly logger = new Logger(WarehouseExportProcessor.name);

  constructor(private readonly exportService: WarehouseExportService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'nightly-analytics-export') {
      throw new UnrecoverableError(
        `Unknown warehouse job in warehouse-export queue: ${job.name}`,
      );
    }

    const result = await this.exportService.runNightlyExport();
    this.logger.log(
      `Warehouse export complete (${result.durationMs}ms, clickhouse=${result.clickhouseLoaded})`,
    );
  }
}
