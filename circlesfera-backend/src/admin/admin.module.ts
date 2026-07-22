import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module.js';
import { AudioModule } from '../audio/audio.module.js';
import { EmailModule } from '../email/email.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { AdminOpsService } from './admin-ops.service.js';

@Module({
  imports: [
    PrismaModule,
    AudioModule,
    AIModule,
    EmailModule,
    NotificationsModule,
    BullModule.registerQueue(
      { name: 'ai-processing' },
      { name: 'analytics-processing' },
    ),
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminOpsService],
})
export class AdminModule {}
