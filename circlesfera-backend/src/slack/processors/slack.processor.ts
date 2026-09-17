import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  getWorkerOptions,
  QUEUE_NAMES,
} from '../../common/constants/queue-policy.constants.js';
import { SlackService } from '../slack.service.js';

@Processor(
  QUEUE_NAMES.SLACK_PROCESSING,
  getWorkerOptions(QUEUE_NAMES.SLACK_PROCESSING),
)
export class SlackProcessor extends WorkerHost {
  private readonly logger = new Logger(SlackProcessor.name);

  constructor(
    @Inject(SlackService) private readonly slackService: SlackService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'send-daily-morning-briefing':
        return this.slackService.sendDailyMorningBriefing();
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }
}
