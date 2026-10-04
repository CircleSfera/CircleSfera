import { Module } from '@nestjs/common';
import { TrustModule } from '../trust/trust.module.js';
import { FollowsController } from './follows.controller.js';
import { FollowsService } from './follows.service.js';

@Module({
  imports: [TrustModule],
  controllers: [FollowsController],
  providers: [FollowsService],
})
export class FollowsModule {}
