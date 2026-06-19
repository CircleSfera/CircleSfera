import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AudioModule } from '../audio/audio.module.js';
import { EmailModule } from '../email/email.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [
    PrismaModule,
    AudioModule,
    EmailModule,
    NotificationsModule,
    BullModule.registerQueue(
      { name: 'ai-processing' },
      { name: 'analytics-processing' },
    ),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
