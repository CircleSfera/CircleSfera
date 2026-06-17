import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SlackController } from './slack.controller.js';
import { SlackService } from './slack.service.js';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [SlackController],
  providers: [SlackService],
  exports: [SlackService],
})
export class SlackModule {}
