import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { LiveRecordingModule } from '../recording/live-recording.module.js';
import { LiveCapacityService } from './live-capacity.service.js';

// How many lives and recordings run at once (PD-092): for the live module
// and the Backoffice's Operations page.
@Module({
  imports: [PrismaModule, LiveRecordingModule],
  providers: [LiveCapacityService],
  exports: [LiveCapacityService],
})
export class LiveCapacityModule {}
