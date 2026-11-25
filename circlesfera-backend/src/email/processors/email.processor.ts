import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import {
  getWorkerOptions,
  QUEUE_NAMES,
} from '../../common/constants/queue-policy.constants.js';
import type { SendMailOptions } from '../email.service.js';
import {
  EmailService,
  FREE_YEAR_ENDING_EMAIL_JOB,
  type FreeYearEndingEmailJob,
  isTransientBrevoFailure,
} from '../email.service.js';

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

  async process(
    job: Job<SendMailOptions | FreeYearEndingEmailJob, void, string>,
  ): Promise<void> {
    if (job.name === FREE_YEAR_ENDING_EMAIL_JOB) {
      // Written now, from what is kept now: the job carries ids only.
      const { applicationId } = job.data as FreeYearEndingEmailJob;
      const mail = await this.emailService.freeYearEndingMailFor(applicationId);
      if (!mail) {
        // The application, its year or the account is gone, or the year
        // ended already: nothing to tell.
        this.logger.log(
          `Free year reminder ${applicationId} skipped: nothing to tell`,
        );
        return;
      }
      return this.deliver(mail);
    }
    if (job.name !== 'send-transactional-email') {
      throw new UnrecoverableError(
        `Unknown job name in email queue: ${job.name}`,
      );
    }
    return this.deliver(job.data as SendMailOptions);
  }

  private async deliver(mail: SendMailOptions): Promise<void> {
    try {
      await this.emailService.deliverMail(mail);
    } catch (error) {
      // A permanent Brevo failure (4xx other than 429) will never succeed
      // on retry -- don't burn the queue's remaining attempts on it.
      if (!isTransientBrevoFailure(error)) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Permanent Brevo failure for ${mail.to}, not retrying: ${message}`,
        );
        throw new UnrecoverableError(
          `Permanent Brevo failure for ${mail.to}: ${message}`,
        );
      }
      throw error;
    }
  }
}
