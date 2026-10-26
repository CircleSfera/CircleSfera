import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  getRegisterQueueOptions,
  QUEUE_NAMES,
} from '../common/constants/queue-policy.constants.js';
import { removeRecurringJob } from '../common/queues/recurring-jobs.js';
import { StoryStickersModule } from '../story-stickers/story-stickers.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { StoriesController } from './stories.controller.js';
import { StoriesService } from './stories.service.js';

@Module({
  imports: [
    StoryStickersModule,
    BullModule.registerQueue(
      getRegisterQueueOptions(QUEUE_NAMES.AI_PROCESSING),
      getRegisterQueueOptions(QUEUE_NAMES.STORIES_PROCESSING),
    ),
    UploadsModule,
  ],
  controllers: [StoriesController],
  providers: [StoriesService],
  exports: [StoriesService],
})
export class StoriesModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(StoriesModule.name);

  constructor(
    @InjectQueue('stories-processing') private readonly storiesQueue: Queue,
  ) {}

  // Expired stories are no longer deleted: each stays in its author's
  // archive. The hourly job that deleted them is taken off the queue, with
  // its pending next run.
  async onApplicationBootstrap() {
    const removed = await removeRecurringJob(
      this.storiesQueue,
      'cleanup-expired',
    );
    if (removed > 0) {
      this.logger.log('Removed the hourly deletion of expired stories');
    }
  }
}
