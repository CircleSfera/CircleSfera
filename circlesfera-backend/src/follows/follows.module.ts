import { Module } from '@nestjs/common';
import { FollowsController } from './follows.controller.js';
import { FollowsService } from './follows.service.js';

@Module({
  imports: [],
  controllers: [FollowsController],
  providers: [FollowsService],
})
export class FollowsModule {}
