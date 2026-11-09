import { Module } from '@nestjs/common';
import { LiveModule } from '../live/live.module.js';
import { TrustModule } from '../trust/trust.module.js';
import { FollowsController } from './follows.controller.js';
import { FollowsService } from './follows.service.js';
import { RestrictionsService } from './restrictions.service.js';

@Module({
  imports: [TrustModule, LiveModule],
  controllers: [FollowsController],
  providers: [FollowsService, RestrictionsService],
})
export class FollowsModule {}
