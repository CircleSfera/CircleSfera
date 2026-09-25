import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import {
  getWorkerOptions,
  QUEUE_NAMES,
} from '../../common/constants/queue-policy.constants.js';
import type { SendMailOptions } from '../email.service.js';
import { EmailService, isTransientBrevoFailure } from '../email.service.js';

@Processor(
  QUEUE_NAMES.EMAIL_PROCESSING,
  getWorkerOptions(QUEUE_NAMES.EMAIL_PROCESSING),
)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    @Inject(EmailService) private readonly emailService: EmailService,
  ) {
    super();
  }

  async process(job: Job<SendMailOptions, void, string>): Promise<void> {
    if (job.name !== 'send-transactional-email') {
      throw new UnrecoverableError(
        `Unknown job name in email queue: ${job.name}`,
      );
    }

    try {
      await this.emailService.deliverMail(job.data);
    } catch (error) {
      // A permanent Brevo failure (4xx other than 429) will never succeed
      // on retry -- don't burn the queue's remaining attempts on it.
      if (!isTransientBrevoFailure(error)) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Permanent Brevo failure for ${job.data.to}, not retrying: ${message}`,
        );
        throw new UnrecoverableError(
          `Permanent Brevo failure for ${job.data.to}: ${message}`,
        );
      }
      throw error;
    }
  }
}
