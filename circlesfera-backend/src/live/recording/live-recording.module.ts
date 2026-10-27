import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { UploadsModule } from '../../uploads/uploads.module.js';
import { LiveRecordingService } from './live-recording.service.js';
import { LiveRecordingsController } from './live-recordings.controller.js';
import { LiveRecordingsService } from './live-recordings.service.js';

@Module({
  imports: [PrismaModule, UploadsModule],
  controllers: [LiveRecordingsController],
  providers: [LiveRecordingService, LiveRecordingsService],
  exports: [LiveRecordingService],
})
export class LiveRecordingModule {}
