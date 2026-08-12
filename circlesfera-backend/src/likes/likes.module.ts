import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LikesController } from './likes.controller.js';
import { LikesService } from './likes.service.js';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: 'analytics-processing' }),
  ],
  controllers: [LikesController],
  providers: [LikesService],
})
export class LikesModule {}
