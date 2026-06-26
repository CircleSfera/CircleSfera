import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module.js';
import { StoriesController } from './stories.controller.js';
import { StoriesCronService } from './stories.cron.js';
import { StoriesService } from './stories.service.js';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'ai-processing',
    }),
    UploadsModule,
  ],
  controllers: [StoriesController],
  providers: [StoriesService, StoriesCronService],
})
export class StoriesModule {}
