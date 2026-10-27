import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { UploadsModule } from '../../uploads/uploads.module.js';
import { LiveRecordingService } from './live-recording.service.js';

@Module({
  imports: [PrismaModule, UploadsModule],
  providers: [LiveRecordingService],
  exports: [LiveRecordingService],
})
export class LiveRecordingModule {}
