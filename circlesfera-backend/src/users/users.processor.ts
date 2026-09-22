import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import {
  getWorkerOptions,
  QUEUE_NAMES,
} from '../common/constants/queue-policy.constants.js';
import { AccountDeletionProcessor } from './account-deletion.processor.js';
import { DataExportProcessor } from './data-export.processor.js';

@Injectable()
@Processor(
  QUEUE_NAMES.USERS_PROCESSING,
  getWorkerOptions(QUEUE_NAMES.USERS_PROCESSING),
)
export class UsersProcessor extends WorkerHost {
  private readonly logger = new Logger(UsersProcessor.name);

  constructor(
    @Inject(AccountDeletionProcessor)
    private readonly accountDeletionProcessor: AccountDeletionProcessor,
    @Inject(DataExportProcessor)
    private readonly dataExportProcessor: DataExportProcessor,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.debug(`Processing ${job.name} (job ${job.id})`);
    switch (job.name) {
      case 'clean-expired-search-history':
      case 'clean-expired-accounts':
      case 'hard-delete-user':
        return this.accountDeletionProcessor.process(job);
      case 'export-data':
      case 'clean-expired-data-exports':
        return this.dataExportProcessor.process(job);
      default:
        throw new UnrecoverableError(
          `Unknown job name in users-processing queue: ${job.name}`,
        );
    }
  }
}
