import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { MediaController } from './media.controller.js';
import { MediaAuthService } from './media-auth.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [MediaController],
  providers: [MediaAuthService],
})
export class MediaModule {}
