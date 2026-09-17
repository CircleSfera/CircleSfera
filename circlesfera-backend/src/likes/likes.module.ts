import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import {
  getRegisterQueueOptions,
  QUEUE_NAMES,
} from '../common/constants/queue-policy.constants.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LikesController } from './likes.controller.js';
import { LikesService } from './likes.service.js';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue(
      getRegisterQueueOptions(QUEUE_NAMES.ANALYTICS_PROCESSING),
    ),
  ],
  controllers: [LikesController],
  providers: [LikesService],
})
export class LikesModule {}
