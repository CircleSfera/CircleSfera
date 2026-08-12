import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { CleanupExpiredMessagesUseCase } from '../use-cases/system/cleanup-expired-messages.use-case.js';

@Processor('chat-processing')
export class ChatProcessor extends WorkerHost {
  private readonly logger = new Logger(ChatProcessor.name);

  constructor(
    @Inject(CleanupExpiredMessagesUseCase)
    private readonly cleanupExpiredMessagesUseCase: CleanupExpiredMessagesUseCase,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'cleanup-expired-messages':
        return this.cleanupExpiredMessagesUseCase.execute();
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }
}
