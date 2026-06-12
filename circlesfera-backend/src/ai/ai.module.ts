import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AIController } from './ai.controller.js';
import { AIService } from './ai.service.js';
import { AIProcessor } from './processors/ai.processor.js';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'ai-processing',
    }),
  ],
  controllers: [AIController],
  providers: [AIService, AIProcessor],
  exports: [AIService, BullModule],
})
export class AIModule {}
