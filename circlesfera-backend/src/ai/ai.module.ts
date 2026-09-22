import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import {
  getRegisterQueueOptions,
  QUEUE_NAMES,
} from '../common/constants/queue-policy.constants.js';
import { AIController } from './ai.controller.js';
import { AIService } from './ai.service.js';
import { AIProcessor } from './processors/ai.processor.js';

@Module({
  imports: [
    BullModule.registerQueue(
      getRegisterQueueOptions(QUEUE_NAMES.AI_PROCESSING),
    ),
  ],
  controllers: [AIController],
  providers: [AIService, AIProcessor],
  exports: [AIService, BullModule],
})
export class AIModule {}
