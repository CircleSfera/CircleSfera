import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AIModule } from '../ai/ai.module.js';
import {
  getRegisterQueueOptions,
  QUEUE_NAMES,
} from '../common/constants/queue-policy.constants.js';
import { removeRecurringJob } from '../common/queues/recurring-jobs.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { EditsController } from './edits.controller.js';
import { EditsService } from './edits.service.js';

@Module({
  imports: [
    UploadsModule,
    AIModule,
    BullModule.registerQueue(
      getRegisterQueueOptions(QUEUE_NAMES.EDITS_PROCESSING),
      getRegisterQueueOptions(QUEUE_NAMES.AI_PROCESSING),
    ),
  ],
  controllers: [EditsController],
  providers: [EditsService],
})
export class EditsModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(EditsModule.name);

  constructor(
    @InjectQueue('edits-processing') private readonly editsQueue: Queue,
  ) {}

  // A draft never expires: it goes only when its author discards or
  // publishes it. The daily job that deleted drafts left untouched for 30
  // days is taken off the queue, with its pending next run.
  async onApplicationBootstrap() {
    const removed = await removeRecurringJob(
      this.editsQueue,
      'cleanup-abandoned-drafts',
    );
    if (removed > 0) {
      this.logger.log('Removed the daily deletion of untouched drafts');
    }
  }
}
