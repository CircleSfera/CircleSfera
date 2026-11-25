import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  getRegisterQueueOptions,
  QUEUE_NAMES,
} from '../common/constants/queue-policy.constants.js';
import { SecurityReportsModule } from '../security-reports/security-reports.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { WarehouseModule } from '../warehouse/warehouse.module.js';
import { OperationsController } from './operations.controller.js';
import { OrphanFilesReportService } from './orphan-files-report.service.js';
import { ResourceAlertsService } from './resource-alerts.service.js';
import {
  OPERATIONS_QUEUES,
  ServerResourcesService,
} from './server-resources.service.js';
import { WarehouseReportService } from './warehouse-report.service.js';

const QUEUES = Object.values(QUEUE_NAMES);

// The Operations page of the Backoffice and the resource alerts (ED-016,
// ADR-0024).
@Module({
  imports: [
    BullModule.registerQueue(...QUEUES.map(getRegisterQueueOptions)),
    SecurityReportsModule,
    UploadsModule,
    WarehouseModule,
  ],
  controllers: [OperationsController],
  providers: [
    {
      provide: OPERATIONS_QUEUES,
      inject: QUEUES.map((name) => getQueueToken(name)),
      useFactory: (...queues: Queue[]) => queues,
    },
    ServerResourcesService,
    WarehouseReportService,
    OrphanFilesReportService,
    ResourceAlertsService,
  ],
})
export class OperationsModule {}
