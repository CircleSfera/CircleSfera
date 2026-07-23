import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AIService } from '../ai/ai.service.js';
import { FeedController } from './feed.controller.js';
import { FeedService } from './feed.service.js';
import { FeedInboxService } from './feed-inbox.service.js';
import { FeedPreferencesController } from './feed-preferences.controller.js';
import { FeedPreferencesService } from './feed-preferences.service.js';
import { FeedFanoutProcessor } from './processors/feed-fanout.processor.js';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue({
      name: 'feed-fanout',
    }),
  ],
  controllers: [FeedController, FeedPreferencesController],
  providers: [
    FeedService,
    AIService,
    FeedInboxService,
    FeedFanoutProcessor,
    FeedPreferencesService,
  ],
  exports: [FeedService, FeedPreferencesService],
})
export class FeedModule {}
