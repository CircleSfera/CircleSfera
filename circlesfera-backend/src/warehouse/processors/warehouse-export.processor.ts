import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { WarehouseExportService } from '../warehouse-export.service.js';

@Processor('warehouse-export')
export class WarehouseExportProcessor extends WorkerHost {
  private readonly logger = new Logger(WarehouseExportProcessor.name);

  constructor(private readonly exportService: WarehouseExportService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'nightly-analytics-export') {
      this.logger.warn(`Unknown warehouse job: ${job.name}`);
      return;
    }

    const result = await this.exportService.runNightlyExport();
    this.logger.log(
      `Warehouse export complete (${result.durationMs}ms, clickhouse=${result.clickhouseLoaded})`,
    );
  }
}
