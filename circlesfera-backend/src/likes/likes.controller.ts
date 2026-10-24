import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { LikesService } from './likes.service.js';

// REST controller for post likes. All endpoints require authentication.
@Controller('posts/:postId/likes')
@UseGuards(JwtAuthGuard)
export class LikesController {
  constructor(private readonly likesService: LikesService) {}

  // Toggle like/unlike on a post.
  @Post('toggle')
  @ApiResponse({ status: 201 })
  async toggle(
    @Param('postId') postId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.likesService.toggle(postId, user.profileId, user.userId);
  }

  // Check if the current user has liked a post.
  @SkipThrottle()
  @Get('check')
  @ApiResponse({ status: 200 })
  async check(
    @Param('postId') postId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.likesService.checkLike(postId, user.profileId);
  }

  // Get all users who liked a post.
  @Get()
  @ApiResponse({ status: 200, type: [Object] })
  async getLikes(
    @Param('postId') postId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.likesService.getLikesByPost(postId, user.profileId);
  }
}
