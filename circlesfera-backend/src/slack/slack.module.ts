import { Global, Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module.js';
import { EmailModule } from '../email/email.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SlackController } from './slack.controller.js';
import { SlackService } from './slack.service.js';

@Global()
@Module({
  imports: [PrismaModule, EmailModule, AIModule],
  controllers: [SlackController],
  providers: [SlackService],
  exports: [SlackService],
})
export class SlackModule {}
