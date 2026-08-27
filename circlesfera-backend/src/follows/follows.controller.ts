import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Profile, User } from '@prisma/client';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { FollowsService } from './follows.service.js';

/** REST controller for follow management, blocking, and follow requests. All endpoints require authentication. */
@ApiTags('Social Graph')
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
    return this.followsService.toggle(username, user.profileId, user.userId);
  }

  /** Check follow status with a specific user. */
  @Get(':username/follow/check')
  async check(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.checkFollow(username, user.profileId);
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
    return this.followsService.blockUser(user.profileId, username);
  }

  /** Unblock a previously blocked user. */
  @Post(':username/follow/unblock')
  async unblock(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.unblockUser(user.profileId, username);
  }

  /** Mute a user by username. */
  @Post(':username/follow/mute')
  async mute(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.muteUser(user.profileId, username);
  }

  /** Unmute a previously muted user. */
  @Post(':username/follow/unmute')
  async unmute(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.unmuteUser(user.profileId, username);
  }

  /** List all muted users. */
  @Get('me/follow/muted')
  async getMuted(
    @CurrentUser() user: CurrentUserData,
  ): Promise<(Profile & { user: User })[]> {
    return this.followsService.getMutedUsers(user.profileId);
  }

  /** List all blocked users. */
  @Get('me/follow/blocked')
  async getBlocked(
    @CurrentUser() user: CurrentUserData,
  ): Promise<(Profile & { user: User })[]> {
    return this.followsService.getBlockedUsers(user.profileId);
  }

  /** List pending follow requests (private account). */
  @Get('me/follow/pending')
  async getPendingRequests(
    @CurrentUser() user: CurrentUserData,
  ): Promise<(Profile & { user: User })[]> {
    return this.followsService.getPendingRequests(user.profileId);
  }

  /** Accept a pending follow request. */
  @Post(':username/follow/accept')
  async acceptRequest(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.acceptFollowRequest(user.profileId, username);
  }

  /** Reject a pending follow request. */
  @Post(':username/follow/reject')
  async rejectRequest(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.rejectFollowRequest(user.profileId, username);
  }
}
