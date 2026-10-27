import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { LiveRecordingService } from './live-recording.service.js';

@Module({
  imports: [PrismaModule],
  providers: [LiveRecordingService],
  exports: [LiveRecordingService],
})
export class LiveRecordingModule {}
