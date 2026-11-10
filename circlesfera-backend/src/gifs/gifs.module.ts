import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { GifsController } from './gifs.controller.js';
import { GiphyService } from './giphy.service.js';

// GIFs in messages, from GIPHY through the server.
@Module({
  imports: [PrismaModule],
  controllers: [GifsController],
  providers: [GiphyService],
  exports: [GiphyService],
})
export class GifsModule {}
