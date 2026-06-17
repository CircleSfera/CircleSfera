import { Module } from '@nestjs/common';
import { EditsController } from './edits.controller.js';
import { EditsService } from './edits.service.js';

@Module({
  controllers: [EditsController],
  providers: [EditsService],
})
export class EditsModule {}
