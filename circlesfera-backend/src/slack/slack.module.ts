import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Global, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { AIModule } from '../ai/ai.module.js';
import {
  getRegisterQueueOptions,
  QUEUE_NAMES,
} from '../common/constants/queue-policy.constants.js';
import { registerRecurringJob } from '../common/queues/recurring-jobs.js';
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
    BullModule.registerQueue(
      getRegisterQueueOptions(QUEUE_NAMES.SLACK_PROCESSING),
    ),
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
    await registerRecurringJob(
      this.slackQueue,
      'slack_briefing_cron',
      'send-daily-morning-briefing',
      '0 8 * * *',
    );
    this.logger.log(
      'Registered repeatable job: send-daily-morning-briefing (0 8 * * *)',
    );
  }
}
