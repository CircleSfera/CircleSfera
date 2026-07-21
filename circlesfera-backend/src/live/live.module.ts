import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LiveController } from './live.controller.js';
import { LiveService } from './live.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [LiveController],
  providers: [LiveService],
})
export class LiveModule {}
