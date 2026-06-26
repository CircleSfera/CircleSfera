import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module.js';
import { EditsController } from './edits.controller.js';
import { EditsService } from './edits.service.js';

@Module({
  imports: [UploadsModule],
  controllers: [EditsController],
  providers: [EditsService],
})
export class EditsModule {}
