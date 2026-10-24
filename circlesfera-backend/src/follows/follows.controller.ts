import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { MuteUserDto } from './dto/mute-user.dto.js';
import {
  FollowsService,
  type MutedUserEntry,
  type ProfileWithUser,
} from './follows.service.js';

// REST controller for follow management, blocking, and follow requests. All endpoints require authentication.
@ApiTags('Relationship Management')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class FollowsController {
  constructor(private readonly followsService: FollowsService) {}

  // Toggle follow/unfollow for a user.
  @Post(':username/follow/toggle')
  @ApiResponse({ status: 201, type: Object })
  async toggle(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.toggle(username, user.profileId, user.userId);
  }

  // Check follow status with a specific user.
  @Get(':username/follow/check')
  @ApiResponse({ status: 200, type: Object })
  async check(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.checkFollow(username, user.profileId);
  }

  // Get followers for a user. Cursor pagination: pass `cursor`
  // (the last item's id from the previous page) to fetch the next page.
  @Get(':username/follow/followers')
  @ApiResponse({ status: 200 })
  async getFollowers(
    @Param('username') username: string,
    @Query() query: PaginationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.getFollowers(
      username,
      query.cursor,
      query.limit,
      user.profileId,
    );
  }

  // Get users that a user follows. Cursor pagination: pass
  // `cursor` (the last item's id from the previous page) to fetch the next
  // page.
  @Get(':username/follow/following')
  @ApiResponse({ status: 200 })
  async getFollowing(
    @Param('username') username: string,
    @Query() query: PaginationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.getFollowing(
      username,
      query.cursor,
      query.limit,
      user.profileId,
    );
  }

  // Block a user by username.
  @Post(':username/follow/block')
  @ApiResponse({ status: 201, type: Object })
  async block(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.blockUser(user.profileId, username);
  }

  // Unblock a previously blocked user.
  @Post(':username/follow/unblock')
  @ApiResponse({ status: 201, type: Object })
  async unblock(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.unblockUser(user.profileId, username);
  }

  // Mute a user by username. Optional body: `{ duration: '24h'|'7d'|'30d'|'forever' }`.
  @Post(':username/follow/mute')
  @ApiResponse({ status: 201, type: Object })
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
  @ApiResponse({ status: 201, type: Object })
  async unmute(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.unmuteUser(user.profileId, username);
  }

  // List currently muted users (includes expiresAt).
  @Get('me/follow/muted')
  @ApiResponse({ status: 200, type: [Object] })
  async getMuted(
    @CurrentUser() user: CurrentUserData,
  ): Promise<MutedUserEntry[]> {
    return this.followsService.getMutedUsers(user.profileId);
  }

  // List all blocked users.
  @Get('me/follow/blocked')
  @ApiResponse({ status: 200 })
  async getBlocked(
    @CurrentUser() user: CurrentUserData,
  ): Promise<ProfileWithUser[]> {
    return this.followsService.getBlockedUsers(user.profileId);
  }

  // List pending follow requests (private account).
  @Get('me/follow/pending')
  @ApiResponse({ status: 200 })
  async getPendingRequests(
    @CurrentUser() user: CurrentUserData,
  ): Promise<ProfileWithUser[]> {
    return this.followsService.getPendingRequests(user.profileId);
  }

  // Accept a pending follow request.
  @Post(':username/follow/accept')
  @ApiResponse({ status: 201, type: Object })
  async acceptRequest(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.acceptFollowRequest(user.profileId, username);
  }

  // Reject a pending follow request.
  @Post(':username/follow/reject')
  @ApiResponse({ status: 201, type: Object })
  async rejectRequest(
    @Param('username') username: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.followsService.rejectFollowRequest(user.profileId, username);
  }
}
