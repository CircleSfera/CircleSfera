import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StoriesModule } from '../stories/stories.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { MaintenanceService } from './maintenance.service.js';

@Module({
  imports: [PrismaModule, UploadsModule, StoriesModule, PostsModule],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
