import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ProfileStrikesController } from './profile-strikes.controller.js';
import { ProfileStrikesService } from './profile-strikes.service.js';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [ProfileStrikesController],
  providers: [ProfileStrikesService],
  exports: [ProfileStrikesService],
})
export class ProfileStrikesModule {}
