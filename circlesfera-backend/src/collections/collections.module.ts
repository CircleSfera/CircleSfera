import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CollectionsController } from './collections.controller.js';
import { CollectionsService } from './collections.service.js';

@Module({
  imports: [PrismaModule, PostsModule],
  controllers: [CollectionsController],
  providers: [CollectionsService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
