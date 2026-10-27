import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { RecentlyDeletedController } from './recently-deleted.controller.js';
import { RecentlyDeletedService } from './recently-deleted.service.js';
import { RecentlyDeletedErasureService } from './recently-deleted-erasure.service.js';

@Module({
  imports: [PrismaModule, UploadsModule],
  controllers: [RecentlyDeletedController],
  providers: [RecentlyDeletedService, RecentlyDeletedErasureService],
})
export class RecentlyDeletedModule {}
