import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { HiddenWordsController } from './hidden-words.controller.js';
import { HiddenWordsService } from './hidden-words.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [HiddenWordsController],
  providers: [HiddenWordsService],
  exports: [HiddenWordsService],
})
export class HiddenWordsModule {}
