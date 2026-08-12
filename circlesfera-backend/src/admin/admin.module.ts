import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module.js';
import { AudioModule } from '../audio/audio.module.js';
import { CreatorModule } from '../creator/creator.module.js';
import { EmailModule } from '../email/email.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminService } from './admin.service.js';
import { AdminContentController } from './admin-content.controller.js';
import { AdminMediaController } from './admin-media.controller.js';
import { AdminOpsController } from './admin-ops.controller.js';
import { AdminOpsService } from './admin-ops.service.js';
import { AdminStatsController } from './admin-stats.controller.js';
import { AdminStatsService } from './admin-stats.service.js';
import { AdminSystemController } from './admin-system.controller.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersService } from './admin-users.service.js';
import { DeleteCommentUseCase } from './use-cases/content/commands/delete-comment.use-case.js';
import { DeletePostUseCase } from './use-cases/content/commands/delete-post.use-case.js';
import { DeleteStoryUseCase } from './use-cases/content/commands/delete-story.use-case.js';
import { EndLiveStreamUseCase } from './use-cases/content/commands/end-live-stream.use-case.js';
import { LogAdminActionUseCase } from './use-cases/content/commands/log-admin-action.use-case.js';
import { ModerateContentUseCase } from './use-cases/content/commands/moderate-content.use-case.js';
import { ReviewPromotionUseCase } from './use-cases/content/commands/review-promotion.use-case.js';
import { ReviewReportUseCase } from './use-cases/content/commands/review-report.use-case.js';
import { GetContentQuery } from './use-cases/content/queries/get-content.query.js';
import { GetLiveStreamsQuery } from './use-cases/content/queries/get-live-streams.query.js';
import { GetModerationQueueQuery } from './use-cases/content/queries/get-moderation-queue.query.js';
import { GetPostsQuery } from './use-cases/content/queries/get-posts.query.js';
import { GetPromotionsQuery } from './use-cases/content/queries/get-promotions.query.js';
import { GetReportsQuery } from './use-cases/content/queries/get-reports.query.js';

@Module({
  imports: [
    PrismaModule,
    AudioModule,
    AIModule,
    EmailModule,
    NotificationsModule,
    CreatorModule,
    UsersModule,
    PaymentsModule,
    BullModule.registerQueue(
      { name: 'ai-processing' },
      { name: 'analytics-processing' },
    ),
  ],
  controllers: [
    AdminContentController,
    AdminMediaController,
    AdminOpsController,
    AdminStatsController,
    AdminSystemController,
    AdminUsersController,
  ],
  providers: [
    AdminService,
    AdminOpsService,
    AdminUsersService,
    AdminStatsService,
    // Content Use Cases & Queries
    DeleteCommentUseCase,
    DeletePostUseCase,
    DeleteStoryUseCase,
    EndLiveStreamUseCase,
    LogAdminActionUseCase,
    ModerateContentUseCase,
    ReviewPromotionUseCase,
    ReviewReportUseCase,
    GetContentQuery,
    GetLiveStreamsQuery,
    GetModerationQueueQuery,
    GetPostsQuery,
    GetPromotionsQuery,
    GetReportsQuery,
  ],
})
export class AdminModule {}
