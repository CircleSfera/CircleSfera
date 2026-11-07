import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StudioTemplatesController } from './studio-templates.controller.js';
import { StudioTemplatesService } from './studio-templates.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [StudioTemplatesController],
  providers: [StudioTemplatesService],
  exports: [StudioTemplatesService],
})
export class StudioTemplatesModule {}
