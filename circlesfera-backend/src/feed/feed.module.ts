import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module.js';
import { FeedController } from './feed.controller.js';
import { FeedService } from './feed.service.js';

@Module({
  imports: [AIModule],
  controllers: [FeedController],
  providers: [FeedService],
  exports: [FeedService],
})
export class FeedModule {}
