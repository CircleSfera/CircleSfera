import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [PrismaModule, AIModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
