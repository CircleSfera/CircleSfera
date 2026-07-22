import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AIController } from './ai.controller.js';
import { AIService } from './ai.service.js';
import { AIProcessor } from './processors/ai.processor.js';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'ai-processing',
    }),
    NotificationsModule,
  ],
  controllers: [AIController],
  providers: [AIService, AIProcessor],
  exports: [AIService, BullModule],
})
export class AIModule {}
