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
import { CollaborationsController } from './collaborations.controller.js';
import { PostCollaboratorsService } from './post-collaborators.service.js';
import { PostTagsController } from './post-tags.controller.js';
import { PostTagsService } from './post-tags.service.js';
import { PostWhyService } from './post-why.service.js';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';
import { FrameCoverService } from './services/frame-cover.service.js';
import { PostDistributionService } from './services/post-distribution.service.js';

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
  controllers: [PostsController, CollaborationsController, PostTagsController],
  providers: [
    PostsService,
    PostWhyService,
    PostCollaboratorsService,
    PostTagsService,
    PostDistributionService,
    FrameCoverService,
  ],
  exports: [PostsService, PostDistributionService],
})
export class PostsModule {}
