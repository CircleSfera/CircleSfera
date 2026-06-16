import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CloseFriendsService } from './close-friends.service.js';

/** REST controller for close friends management. All endpoints require authentication. */
@Controller('close-friends')
@UseGuards(JwtAuthGuard)
export class CloseFriendsController {
  constructor(private readonly closeFriendsService: CloseFriendsService) {}

  /** List the authenticated user's close friends. */
  @Get()
  async getCloseFriends(@CurrentUser() user: CurrentUserData) {
    return this.closeFriendsService.getCloseFriends(user.userId);
  }

  /** Toggle close-friend status for a user. */
  @Post(':friendId')
  async toggleCloseFriend(
    @CurrentUser() user: CurrentUserData,
    @Param('friendId') friendId: string,
  ) {
    return this.closeFriendsService.toggleCloseFriend(user.userId, friendId);
  }
}
