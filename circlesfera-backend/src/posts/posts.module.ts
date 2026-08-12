import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module.js';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { PostsController } from './posts.controller.js';
import { PostsProcessor } from './posts.processor.js';
import { PostsService } from './posts.service.js';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'feed-fanout',
    }),
    BullModule.registerQueue({
      name: 'posts-processing',
    }),
    PrismaModule,
    AIModule,
    AnalyticsModule,
    UploadsModule,
  ],
  controllers: [PostsController],
  providers: [PostsService, PostsProcessor],
  exports: [PostsService],
})
export class PostsModule {}
