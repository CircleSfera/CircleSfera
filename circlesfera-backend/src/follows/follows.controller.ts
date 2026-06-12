import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { Profile, User } from '@prisma/client';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for DI
import { FollowsService } from './follows.service.js';

/** REST controller for follow management, blocking, and follow requests. All endpoints require authentication. */
@Controller('users')
@UseGuards(JwtAuthGuard)
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  /** Toggle follow/unfollow for a user. */
  @Post(':username/follow/toggle')
  async toggle(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.toggle(username, user.userId);
  }

  /** Check follow status with a specific user. */
  @Get(':username/follow/check')
  async check(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.checkFollow(username, user.userId);
  }

  /** Get followers for a user. */
  @Get(':username/follow/followers')
  async getFollowers(@Param('username') username: string) {
    return this.followsService.getFollowers(username);
  }

  /** Get users that a user follows. */
  @Get(':username/follow/following')
  async getFollowing(@Param('username') username: string) {
    return this.followsService.getFollowing(username);
  }

  /** Block a user by username. */
  @Post(':username/follow/block')
  async block(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.blockUser(user.userId, username);
  }

  /** Unblock a previously blocked user. */
  @Post(':username/follow/unblock')
  async unblock(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.unblockUser(user.userId, username);
  }

  /** List all blocked users. */
  @Get('me/follow/blocked')
  async getBlocked(
    @CurrentUser() user: CurrentUserData,
  ): Promise<(User & { profile: Profile | null })[]> {
    return this.followsService.getBlockedUsers(user.userId);
  }

  /** List pending follow requests (private account). */
  @Get('me/follow/pending')
  async getPendingRequests(
    @CurrentUser() user: CurrentUserData,
  ): Promise<(User & { profile: Profile | null })[]> {
    return this.followsService.getPendingRequests(user.userId);
  }

  /** Accept a pending follow request. */
  @Post(':username/follow/accept')
  async acceptRequest(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.acceptFollowRequest(user.userId, username);
  }

  /** Reject a pending follow request. */
  @Post(':username/follow/reject')
  async rejectRequest(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.rejectFollowRequest(user.userId, username);
  }
}
