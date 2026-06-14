import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for metadata reflection
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { FeedService } from './feed.service.js';

@Controller('feed')
export class FeedController {
  constructor(@Inject(FeedService) private readonly feedService: FeedService) {}

  /** Get personalized hybrid "For You" feed */
  @Get('foryou')
  @UseGuards(JwtOptionalGuard)
  async getForYou(
    @CurrentUser() user: CurrentUserData | null,
    @Query() pagination: PaginationDto,
  ) {
    return this.feedService.getHybridFeed(user?.userId || null, pagination);
  }

  /** Get personalized feed from followed users */
  @Get('following')
  @UseGuards(JwtAuthGuard)
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
    return this.feedService.getFollowingFeed(user.userId, pagination);
  }
}
