import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { EditsService } from '../edits.service.js';

@Processor('edits-processing')
export class EditsProcessor extends WorkerHost {
  private readonly logger = new Logger(EditsProcessor.name);

  constructor(
    @Inject(EditsService) private readonly editsService: EditsService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'cleanup-abandoned-drafts':
        return this.editsService.cleanupAbandonedDrafts();
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }
}
