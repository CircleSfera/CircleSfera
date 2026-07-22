import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SlackModule } from '../slack/slack.module.js';
import { AppealsController } from './appeals.controller.js';
import { AppealsService } from './appeals.service.js';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    SlackModule,
    NotificationsModule,
    JwtModule.register({}),
  ],
  controllers: [AppealsController],
  providers: [AppealsService],
})
export class AppealsModule {}
