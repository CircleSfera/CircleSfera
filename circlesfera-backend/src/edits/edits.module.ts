import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AIModule } from '../ai/ai.module.js';
import {
  getRegisterQueueOptions,
  QUEUE_NAMES,
} from '../common/constants/queue-policy.constants.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { EditsController } from './edits.controller.js';
import { EditsService } from './edits.service.js';
import { EditsProcessor } from './processors/edits.processor.js';

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
  providers: [EditsService, EditsProcessor],
})
export class EditsModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(EditsModule.name);

  constructor(
    @InjectQueue('edits-processing') private readonly editsQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    await this.editsQueue.add(
      'cleanup-abandoned-drafts',
      {},
      {
        repeat: { pattern: '0 0 * * *' },
        jobId: 'edits_cleanup_cron',
      },
    );
    this.logger.log(
      'Registered repeatable job: cleanup-abandoned-drafts (0 0 * * *)',
    );
  }
}
