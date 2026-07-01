import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { UploadsModule } from '../uploads/uploads.module.js';
import { StoriesProcessor } from './processors/stories.processor.js';
import { StoriesController } from './stories.controller.js';
import { StoriesService } from './stories.service.js';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'ai-processing',
    }),
    BullModule.registerQueue({
      name: 'stories-processing',
    }),
    UploadsModule,
  ],
  controllers: [StoriesController],
  providers: [StoriesService, StoriesProcessor],
})
export class StoriesModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(StoriesModule.name);

  constructor(
    @InjectQueue('stories-processing') private readonly storiesQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    await this.storiesQueue.add(
      'cleanup-expired',
      {},
      {
        repeat: { pattern: '0 * * * *' }, // EVERY_HOUR
        jobId: 'cleanup_stories_cron',
      },
    );
    this.logger.log('Registered repeatable job: cleanup-expired (0 * * * *)');
  }
}
