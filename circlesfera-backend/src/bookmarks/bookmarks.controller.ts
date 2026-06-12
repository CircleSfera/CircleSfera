import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for DI
import { BookmarksService } from './bookmarks.service.js';

/** REST controller for bookmark management. All endpoints require authentication. */
@Controller('bookmarks')
@UseGuards(JwtAuthGuard)
export class BookmarksController {
  constructor(private readonly bookmarksService: BookmarksService) {}

  /** Toggle bookmark on/off for a post, optionally assigning to a collection. */
  @Post(':postId')
  toggle(
    @CurrentUser() user: CurrentUserData,
    @Param('postId') postId: string,
    @Body('collectionId') collectionId?: string,
  ) {
    return this.bookmarksService.toggle(user.userId, postId, collectionId);
  }

  /** Move a bookmarked post to a different collection. */
  @Patch(':postId/collection')
  updateCollection(
    @CurrentUser() user: CurrentUserData,
    @Param('postId') postId: string,
    @Body('collectionId') collectionId: string,
  ) {
    return this.bookmarksService.updateCollection(
      user.userId,
      postId,
      collectionId,
    );
  }

  /** List all bookmarked posts (paginated, optionally filtered by collection). */
  @Get()
  getBookmarks(
    @CurrentUser() user: CurrentUserData,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('collectionId') collectionId?: string,
  ) {
    return this.bookmarksService.getBookmarks(
      user.userId,
      Number(page),
      Number(limit),
      collectionId,
    );
  }

  /** Check whether a user has bookmarked a specific post. */
  @SkipThrottle()
  @Get(':postId/check')
  check(@CurrentUser() user: CurrentUserData, @Param('postId') postId: string) {
    return this.bookmarksService.check(user.userId, postId);
  }
}
