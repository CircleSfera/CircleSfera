import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import {
  getWorkerOptions,
  QUEUE_NAMES,
} from '../../common/constants/queue-policy.constants.js';
import { EditsService } from '../edits.service.js';

@Processor(
  QUEUE_NAMES.EDITS_PROCESSING,
  getWorkerOptions(QUEUE_NAMES.EDITS_PROCESSING),
)
export class EditsProcessor extends WorkerHost {
  private readonly logger = new Logger(EditsProcessor.name);

  constructor(
    @Inject(EditsService) private readonly editsService: EditsService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.debug(`Processing ${job.name} (job ${job.id})`);
    switch (job.name) {
      case 'cleanup-abandoned-drafts':
        return this.editsService.cleanupAbandonedDrafts();
      default:
        throw new UnrecoverableError(
          `Unknown job name in edits queue: ${job.name}`,
        );
    }
  }
}
