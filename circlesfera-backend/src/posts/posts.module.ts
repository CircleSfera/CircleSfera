import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module.js';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { PostsController } from './posts.controller.js';
import { PostsService } from './posts.service.js';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    AIModule,
    AnalyticsModule,
    UploadsModule,
  ],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
