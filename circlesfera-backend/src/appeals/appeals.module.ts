import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SlackModule } from '../slack/slack.module.js';
import { AppealsController } from './appeals.controller.js';
import { AppealsService } from './appeals.service.js';

@Module({
  imports: [PrismaModule, ConfigModule, SlackModule, JwtModule.register({})],
  controllers: [AppealsController],
  providers: [AppealsService],
})
export class AppealsModule {}
