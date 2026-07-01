import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ChatService } from '../chat.service.js';

@Processor('chat-processing')
export class ChatProcessor extends WorkerHost {
  private readonly logger = new Logger(ChatProcessor.name);

  constructor(@Inject(ChatService) private readonly chatService: ChatService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'cleanup-expired-messages':
        return this.chatService.cleanupExpiredMessages();
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }
}
