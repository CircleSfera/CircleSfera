import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SlackModule } from '../slack/slack.module.js';
import { SupportController } from './support.controller.js';
import { SupportService } from './support.service.js';

@Module({
  imports: [PrismaModule, SlackModule],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
