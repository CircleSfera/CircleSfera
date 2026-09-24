import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { StoryReaction, StoryView } from '@prisma/client';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { RequireOwnership } from '../auth/decorators/require-ownership.decorator.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { OwnershipGuard } from '../auth/guards/ownership.guard.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { CreateStoryDto } from './dto/create-story.dto.js';
import { StoryReactionDto } from './dto/story-reaction.dto.js';
import { StoriesService } from './stories.service.js';

// REST controller for ephemeral stories, views, and reactions.
@Controller('stories')
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  // Create a new 24-hour ephemeral story.
  @Post()
  @UseGuards(JwtAuthGuard, EmailVerifiedGuard)
  create(
    @CurrentUser() user: CurrentUserData,
    @Body() createStoryDto: CreateStoryDto,
  ) {
    return this.storiesService.create(user.profileId, createStoryDto);
  }

  // List all active stories (filtered by followed users).
  @Get()
  @UseGuards(JwtOptionalGuard)
  findAll(@CurrentUser() user: CurrentUserData | null) {
    return this.storiesService.findAll(user?.profileId);
  }

  // Get active stories by a specific user.
  @Get('user/:username')
  @UseGuards(JwtOptionalGuard)
  findByUser(
    @CurrentUser() user: CurrentUserData | null,
    @Param('username') username: string,
  ) {
    return this.storiesService.findByUser(username, user?.profileId);
  }

  // Get all stories (archive) for the current user.
  @Get('archive')
  @UseGuards(JwtAuthGuard)
  getArchive(@CurrentUser() user: CurrentUserData) {
    return this.storiesService.getArchive(user.profileId);
  }

  // Delete a story (author only).
  @Delete(':id')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @RequireOwnership({ model: 'Story' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.storiesService.delete(id);
  }

  // Record a view on a story (idempotent).
  @Post(':id/view')
  @UseGuards(JwtAuthGuard)
  async view(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
  ): Promise<StoryView> {
    return this.storiesService.view(id, user.profileId);
  }

  // Get viewers of a story. Owner-only — view lists can reveal who watched,
  // which is sensitive the same way message read-receipts are. Cursor
  // pagination (DATA-003): pass `cursor` (opaque, from the previous page's
  // nextCursor) to fetch the next page.
  @Get(':id/views')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @RequireOwnership({ model: 'Story' })
  async getViews(@Param('id') id: string, @Query() query: PaginationDto) {
    return this.storiesService.getViews(id, query.cursor, query.limit);
  }

  // Add or update a reaction on a story.
  @Post(':id/react')
  @UseGuards(JwtAuthGuard, EmailVerifiedGuard)
  async react(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: StoryReactionDto,
  ): Promise<StoryReaction> {
    return this.storiesService.addReaction(id, user.profileId, dto.reaction);
  }

  // Get reactions for a story. Cursor pagination (DATA-003): pass `cursor`
  // (the last item's id from the previous page) to fetch the next page.
  @Get(':id/reactions')
  async getReactions(@Param('id') id: string, @Query() query: PaginationDto) {
    return this.storiesService.getReactions(id, query.cursor, query.limit);
  }
}
