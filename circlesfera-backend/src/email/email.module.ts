import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import {
  getRegisterQueueOptions,
  QUEUE_NAMES,
} from '../common/constants/queue-policy.constants.js';
import { EmailService } from './email.service.js';
import { NewsletterUnsubscribe } from './newsletter-unsubscribe.js';
import { EmailProcessor } from './processors/email.processor.js';

@Module({
  imports: [
    BullModule.registerQueue(
      getRegisterQueueOptions(QUEUE_NAMES.EMAIL_PROCESSING),
    ),
  ],
  providers: [EmailService, EmailProcessor, NewsletterUnsubscribe],
  exports: [EmailService, NewsletterUnsubscribe],
})
export class EmailModule {}
