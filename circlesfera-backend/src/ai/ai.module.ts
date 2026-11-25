import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  getRegisterQueueOptions,
  QUEUE_NAMES,
} from '../common/constants/queue-policy.constants.js';
import { registerRecurringJob } from '../common/queues/recurring-jobs.js';
import { AIController } from './ai.controller.js';
import { AIService } from './ai.service.js';
import { PostTopicsService } from './post-topics/post-topics.service.js';
import {
  AIProcessor,
  ASSIGN_POST_TOPICS_JOB,
} from './processors/ai.processor.js';

// Every ten minutes, the posts with an embedding and no topic get one.
export const POST_TOPICS_SWEEP_SCHEDULE = '*/10 * * * *';

@Module({
  imports: [
    BullModule.registerQueue(
      getRegisterQueueOptions(QUEUE_NAMES.AI_PROCESSING),
    ),
  ],
  controllers: [AIController],
  providers: [AIService, AIProcessor, PostTopicsService],
  exports: [AIService, BullModule],
})
export class AIModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(AIModule.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.AI_PROCESSING) private readonly aiQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    await registerRecurringJob(
      this.aiQueue,
      'post_topics_sweep',
      ASSIGN_POST_TOPICS_JOB,
      POST_TOPICS_SWEEP_SCHEDULE,
    );
    this.logger.log(
      `Registered repeatable job: ${ASSIGN_POST_TOPICS_JOB} (${POST_TOPICS_SWEEP_SCHEDULE})`,
    );
  }
}
