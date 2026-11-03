import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AudioController } from './audio.controller.js';
import { AudioService } from './audio.service.js';

@Module({
  imports: [PrismaModule, PostsModule],
  controllers: [AudioController],
  providers: [AudioService],
  exports: [AudioService],
})
export class AudioModule {}
