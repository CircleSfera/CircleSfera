import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module.js';
import { AdminIllegalNoticesController } from './admin-illegal-notices.controller.js';
import { IllegalNoticesController } from './illegal-notices.controller.js';
import { IllegalNoticesService } from './illegal-notices.service.js';

@Module({
  imports: [EmailModule],
  controllers: [IllegalNoticesController, AdminIllegalNoticesController],
  providers: [IllegalNoticesService],
})
export class IllegalNoticesModule {}
