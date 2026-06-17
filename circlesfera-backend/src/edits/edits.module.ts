import { Module } from '@nestjs/common';
import { EditsService } from './edits.service.js';
import { EditsController } from './edits.controller.js';

@Module({
  controllers: [EditsController],
  providers: [EditsService],
})
export class EditsModule {}
