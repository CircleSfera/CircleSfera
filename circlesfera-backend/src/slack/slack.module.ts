import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Global, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AIModule } from '../ai/ai.module.js';
import { EmailModule } from '../email/email.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SlackProcessor } from './processors/slack.processor.js';
import { SlackController } from './slack.controller.js';
import { SlackService } from './slack.service.js';

@Global()
@Module({
  imports: [
    PrismaModule,
    EmailModule,
    AIModule,
    BullModule.registerQueue({
      name: 'slack-processing',
    }),
  ],
  controllers: [SlackController],
  providers: [SlackService, SlackProcessor],
  exports: [SlackService],
})
export class SlackModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(SlackModule.name);

  constructor(
    @InjectQueue('slack-processing') private readonly slackQueue: Queue,
  ) {}

  async onApplicationBootstrap() {
    await this.slackQueue.add(
      'send-daily-morning-briefing',
      {},
      {
        repeat: { pattern: '0 8 * * *' }, // 08:00 AM UTC
        jobId: 'slack_briefing_cron',
      },
    );
    this.logger.log(
      'Registered repeatable job: send-daily-morning-briefing (0 8 * * *)',
    );
  }
}
