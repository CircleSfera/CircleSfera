import * as dotenv from 'dotenv';

dotenv.config();

import { join } from 'node:path';
import { BullModule } from '@nestjs/bullmq';
import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SentryModule } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { AdminModule } from './admin/admin.module.js';
import { AIModule } from './ai/ai.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AppealsModule } from './appeals/appeals.module.js';
import { AudioModule } from './audio/audio.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BookmarksModule } from './bookmarks/bookmarks.module.js';
import { ChatModule } from './chat/chat.module.js';
import { CloseFriendsModule } from './close-friends/close-friends.module.js';
import { CollectionsModule } from './collections/collections.module.js';
import { CommentsModule } from './comments/comments.module.js';
import { RedisCacheModule } from './common/cache/cache.module.js';
import { CsrfController } from './common/csrf/csrf.controller.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { CreatorModule } from './creator/creator.module.js';
import { EditsModule } from './edits/edits.module.js';
import { EmailModule } from './email/email.module.js';
import { ExperimentsModule } from './experiments/experiments.module.js';
import { FeedModule } from './feed/feed.module.js';
import { FollowsModule } from './follows/follows.module.js';
import { HealthModule } from './health/health.module.js';
import { HighlightsModule } from './highlights/highlights.module.js';
import { LikesModule } from './likes/likes.module.js';
import { LiveModule } from './live/live.module.js';
import { MaintenanceModule } from './maintenance/maintenance.module.js';
import { MediaModule } from './media/media.module.js';
import { MonetizationModule } from './monetization/monetization.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PostsModule } from './posts/posts.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProfilesModule } from './profiles/profiles.module.js';
import { PushModule } from './push/push.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { SearchModule } from './search/search.module.js';
import { SeoModule } from './seo/seo.module.js';
import { SlackModule } from './slack/slack.module.js';
import { SocketModule } from './socket/socket.module.js';
import { StoriesModule } from './stories/stories.module.js';
import { SupportModule } from './support/support.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { UsersModule } from './users/users.module.js';
import { WebrtcModule } from './webrtc/webrtc.module.js';
import { WhitelistModule } from './whitelist/whitelist.module.js';

@Module({
  imports: [
    SentryModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: true,
                  ignore: 'pid,hostname',
                },
              }
            : undefined,
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        redact: ['req.headers.cookie', 'req.headers.authorization'],
      },
    }),

    ScheduleModule.forRoot(),
    RedisCacheModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST') || 'localhost',
          port: configService.get<number>('REDIS_PORT') || 6379,
        },
      }),
    }),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'short',
            ttl: 1000, // 1 second
            limit: config.get<number>('THROTTLE_SHORT_LIMIT') || 100,
          },
          {
            name: 'medium',
            ttl: 60000, // 1 minute
            limit: config.get<number>('THROTTLE_MEDIUM_LIMIT') || 1000,
          },
          {
            name: 'long',
            ttl: 3600000, // 1 hour
            limit: config.get<number>('THROTTLE_LONG_LIMIT') || 5000,
          },
        ],
      }),
    }),
    PrismaModule,
    AuthModule,
    ProfilesModule,
    PostsModule,
    CommentsModule,
    LikesModule,
    FollowsModule,
    StoriesModule,
    NotificationsModule,
    ChatModule,
    SearchModule,
    UploadsModule,
    BookmarksModule,
    CollectionsModule,
    MediaModule,
    ...(process.env.CLOUDINARY_NAME
      ? []
      : [
          ServeStaticModule.forRoot({
            rootPath: join(process.cwd(), 'uploads'),
            serveRoot: '/uploads',
          }),
        ]),
    HighlightsModule,
    CloseFriendsModule,
    ReportsModule,
    UsersModule,
    AppealsModule,
    SocketModule,
    AIModule,
    AudioModule,
    EmailModule,
    AdminModule,
    CreatorModule,
    WhitelistModule,
    AnalyticsModule,
    HealthModule,
    PaymentsModule,
    PushModule,
    MonetizationModule,
    SeoModule,
    FeedModule,
    WebrtcModule,
    EditsModule,
    SlackModule,
    SupportModule,
    ExperimentsModule,
    MaintenanceModule,
    LiveModule,
  ],
  controllers: [AppController, CsrfController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
