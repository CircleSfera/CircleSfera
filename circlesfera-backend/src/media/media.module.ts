import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { MediaController } from './media.controller.js';
import { MediaAuthService } from './media-auth.service.js';

@Module({
  imports: [PrismaModule, UploadsModule],
  controllers: [MediaController],
  providers: [MediaAuthService],
})
export class MediaModule {}
