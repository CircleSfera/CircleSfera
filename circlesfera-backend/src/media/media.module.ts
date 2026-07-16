import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MediaController } from './media.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [MediaController],
})
export class MediaModule {}
