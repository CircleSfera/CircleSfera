import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { InteractiveController } from './interactive.controller.js';
import { InteractiveService } from './interactive.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [InteractiveController],
  providers: [InteractiveService],
  exports: [InteractiveService],
})
export class InteractiveModule {}
