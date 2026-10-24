import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { MemberAllowed } from '../team/member-allowed.decorator.js';
import { FeedService } from './feed.service.js';

@Controller('feed')
export class FeedController {
  constructor(@Inject(FeedService) private readonly feedService: FeedService) {}

  // Get personalized hybrid "For You" feed
  @Get('foryou')
  @MemberAllowed('browse')
  @UseGuards(JwtOptionalGuard)
  @ApiResponse({ status: 200 })
  async getForYou(
    @CurrentUser() user: CurrentUserData | null,
    @Query() pagination: PaginationDto,
  ) {
    return this.feedService.getHybridFeed(
      user?.profileId || null,
      pagination,
      user?.userId || null,
    );
  }

  // Get personalized feed from followed users
  @Get('following')
  @MemberAllowed('browse')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200 })
  async getFollowing(
    @CurrentUser() user: CurrentUserData | null,
    @Query() pagination: PaginationDto,
  ) {
    if (!user) {
      return {
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
      };
    }
    return this.feedService.getFollowingFeed(user.profileId, pagination);
  }
}
