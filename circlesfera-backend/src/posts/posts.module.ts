import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module.js';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import {
  getRegisterQueueOptions,
  QUEUE_NAMES,
} from '../common/constants/queue-policy.constants.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StudioTemplatesModule } from '../studio-templates/studio-templates.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { PostWhyService } from './post-why.service.js';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';
import { FrameCoverService } from './services/frame-cover.service.js';
import { PostDistributionService } from './services/post-distribution.service.js';
import { PostPaywallService } from './services/post-paywall.service.js';

@Module({
  imports: [
    BullModule.registerQueue(getRegisterQueueOptions(QUEUE_NAMES.FEED_FANOUT)),
    // Asking for the cover of a frame is a job of the video queue.
    BullModule.registerQueue(
      getRegisterQueueOptions(QUEUE_NAMES.VIDEO_TRANSCODING),
    ),
    PrismaModule,
    AIModule,
    AnalyticsModule,
    UploadsModule,
    StudioTemplatesModule,
  ],
  controllers: [PostsController],
  providers: [
    PostsService,
    PostWhyService,
    PostPaywallService,
    PostDistributionService,
    FrameCoverService,
  ],
  exports: [PostsService, PostPaywallService, PostDistributionService],
})
export class PostsModule {}
