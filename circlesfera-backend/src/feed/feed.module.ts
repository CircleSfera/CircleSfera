import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AIModule } from '../ai/ai.module.js';
import {
  getRegisterQueueOptions,
  QUEUE_NAMES,
} from '../common/constants/queue-policy.constants.js';
import { ExperimentsModule } from '../experiments/experiments.module.js';
import { FeedController } from './feed.controller.js';
import { FeedService } from './feed.service.js';
import { FeedInboxService } from './feed-inbox.service.js';
import { FeedPreferencesController } from './feed-preferences.controller.js';
import { FeedPreferencesService } from './feed-preferences.service.js';
import { FeedFanoutProcessor } from './processors/feed-fanout.processor.js';

@Module({
  imports: [
    ConfigModule,
    ExperimentsModule,
    AIModule,
    BullModule.registerQueue(getRegisterQueueOptions(QUEUE_NAMES.FEED_FANOUT)),
  ],
  controllers: [FeedController, FeedPreferencesController],
  providers: [
    FeedService,
    FeedInboxService,
    FeedFanoutProcessor,
    FeedPreferencesService,
  ],
  exports: [FeedService, FeedPreferencesService],
})
export class FeedModule {}
