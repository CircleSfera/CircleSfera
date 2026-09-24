import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Profile, User } from '@prisma/client';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { MuteUserDto } from './dto/mute-user.dto.js';
import { FollowsService, type MutedUserEntry } from './follows.service.js';

// REST controller for follow management, blocking, and follow requests. All endpoints require authentication.
@ApiTags('Social Graph')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  // Toggle follow/unfollow for a user.
  @Post(':username/follow/toggle')
  async toggle(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.toggle(username, user.profileId, user.userId);
  }

  // Check follow status with a specific user.
  @Get(':username/follow/check')
  async check(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.checkFollow(username, user.profileId);
  }

  // Get followers for a user. Cursor pagination (DATA-003): pass `cursor`
  // (the last item's id from the previous page) to fetch the next page.
  @Get(':username/follow/followers')
  async getFollowers(
    @Param('username') username: string,
    @Query() query: PaginationDto,
  ) {
    return this.followsService.getFollowers(
      username,
      query.cursor,
      query.limit,
    );
  }

  // Get users that a user follows. Cursor pagination (DATA-003): pass
  // `cursor` (the last item's id from the previous page) to fetch the next
  // page.
  @Get(':username/follow/following')
  async getFollowing(
    @Param('username') username: string,
    @Query() query: PaginationDto,
  ) {
    return this.followsService.getFollowing(
      username,
      query.cursor,
      query.limit,
    );
  }

  // Block a user by username.
  @Post(':username/follow/block')
  async block(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.blockUser(user.profileId, username);
  }

  // Unblock a previously blocked user.
  @Post(':username/follow/unblock')
  async unblock(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.unblockUser(user.profileId, username);
  }

  // Mute a user by username. Optional body: `{ duration: '24h'|'7d'|'30d'|'forever' }`.
  @Post(':username/follow/mute')
  async mute(
    @Param('username') username: string,
    @Body() dto: MuteUserDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.muteUser(
      user.profileId,
      username,
      dto?.duration,
    );
  }

  // Unmute a previously muted user.
  @Post(':username/follow/unmute')
  async unmute(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.unmuteUser(user.profileId, username);
  }

  // List currently muted users (includes expiresAt).
  @Get('me/follow/muted')
  async getMuted(
    @CurrentUser() user: CurrentUserData,
  ): Promise<MutedUserEntry[]> {
    return this.followsService.getMutedUsers(user.profileId);
  }

  // List all blocked users.
  @Get('me/follow/blocked')
  async getBlocked(
    @CurrentUser() user: CurrentUserData,
  ): Promise<(Profile & { user: User })[]> {
    return this.followsService.getBlockedUsers(user.profileId);
  }

  // List pending follow requests (private account).
  @Get('me/follow/pending')
  async getPendingRequests(
    @CurrentUser() user: CurrentUserData,
  ): Promise<(Profile & { user: User })[]> {
    return this.followsService.getPendingRequests(user.profileId);
  }

  // Accept a pending follow request.
  @Post(':username/follow/accept')
  async acceptRequest(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.acceptFollowRequest(user.profileId, username);
  }

  // Reject a pending follow request.
  @Post(':username/follow/reject')
  async rejectRequest(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.rejectFollowRequest(user.profileId, username);
  }
}
