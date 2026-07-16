import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { MaintenanceService } from './maintenance.service.js';

@Module({
  imports: [PrismaModule, UploadsModule],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
