import { Module } from '@nestjs/common';
import { CloseFriendsController } from './close-friends.controller.js';
import { CloseFriendsService } from './close-friends.service.js';

@Module({
  controllers: [CloseFriendsController],
  providers: [CloseFriendsService],
  exports: [CloseFriendsService],
})
export class CloseFriendsModule {}
