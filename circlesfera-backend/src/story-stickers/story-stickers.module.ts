import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StoryStickersService } from './story-stickers.service.js';

@Module({
  imports: [PrismaModule],
  providers: [StoryStickersService],
  exports: [StoryStickersService],
})
export class StoryStickersModule {}
