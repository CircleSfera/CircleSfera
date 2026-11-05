import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import {
  getRegisterQueueOptions,
  QUEUE_NAMES,
} from '../common/constants/queue-policy.constants.js';
import { HiddenWordsModule } from '../hidden-words/hidden-words.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { TrustModule } from '../trust/trust.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';

@Module({
  imports: [
    UploadsModule,
    HiddenWordsModule,
    PrismaModule,
    TrustModule,
    BullModule.registerQueue(
      getRegisterQueueOptions(QUEUE_NAMES.AI_PROCESSING),
      getRegisterQueueOptions(QUEUE_NAMES.ANALYTICS_PROCESSING),
    ),
  ],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
