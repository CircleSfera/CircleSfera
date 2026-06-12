import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { StoriesController } from './stories.controller.js';
import { StoriesService } from './stories.service.js';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'ai-processing',
    }),
  ],
  controllers: [StoriesController],
  providers: [StoriesService],
})
export class StoriesModule {}
