import { Module } from '@nestjs/common';
import { ExperimentsController } from './experiments.controller.js';
import { ExperimentsService } from './experiments.service.js';

@Module({
  providers: [ExperimentsService],
  controllers: [ExperimentsController],
})
export class ExperimentsModule {}
