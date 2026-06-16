import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { DataExportService } from './data-export.service.js';
import { GdprCron } from './gdpr.cron.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [UsersController],
  providers: [UsersService, DataExportService, GdprCron],
  exports: [UsersService],
})
export class UsersModule {}
