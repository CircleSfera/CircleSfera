import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PlacesController } from './places.controller.js';
import { PlacesService } from './places.service.js';

@Module({
  imports: [PrismaModule, PostsModule],
  controllers: [PlacesController],
  providers: [PlacesService],
  exports: [PlacesService],
})
export class PlacesModule {}
