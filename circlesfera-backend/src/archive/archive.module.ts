import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { ArchiveController } from './archive.controller.js';
import { ArchiveService } from './archive.service.js';
import { StoryArchiveErasureService } from './story-archive-erasure.service.js';

@Module({
  imports: [PrismaModule, UploadsModule],
  controllers: [ArchiveController],
  providers: [ArchiveService, StoryArchiveErasureService],
})
export class ArchiveModule {}
