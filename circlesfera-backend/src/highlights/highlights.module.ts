import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module.js';
import { HighlightsController } from './highlights.controller.js';
import { HighlightsService } from './highlights.service.js';

@Module({
  imports: [UploadsModule],
  controllers: [HighlightsController],
  providers: [HighlightsService],
})
export class HighlightsModule {}
