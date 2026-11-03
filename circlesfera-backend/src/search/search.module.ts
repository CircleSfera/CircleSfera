import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module.js';
import { PostsModule } from '../posts/posts.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [PrismaModule, AIModule, PostsModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
