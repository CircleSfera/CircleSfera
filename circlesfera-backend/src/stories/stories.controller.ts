import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { StoryReaction, StoryView } from '@prisma/client';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for metadata reflection
import { CreateStoryDto } from './dto/create-story.dto.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for metadata reflection
import { StoryReactionDto } from './dto/story-reaction.dto.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for DI
import {
  StoriesService,
  type StoryReactionWithUser,
} from './stories.service.js';

/** REST controller for ephemeral stories, views, and reactions. */
@Controller('stories')
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  /** Create a new 24-hour ephemeral story. */
  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: CurrentUserData,
    @Body() createStoryDto: CreateStoryDto,
  ) {
    return this.storiesService.create(user.userId, createStoryDto);
  }

  /** List all active stories (filtered by followed users). */
  @Get()
  @UseGuards(JwtOptionalGuard)
  findAll(@CurrentUser() user: CurrentUserData | null) {
    return this.storiesService.findAll(user?.userId);
  }

  /** Get active stories by a specific user. */
  @Get('user/:username')
  @UseGuards(JwtOptionalGuard)
  findByUser(
    @CurrentUser() user: CurrentUserData | null,
    @Param('username') username: string,
  ) {
    return this.storiesService.findByUser(username, user?.userId);
  }

  /** Get all stories (archive) for the current user. */
  @Get('archive')
  @UseGuards(JwtAuthGuard)
  getArchive(@CurrentUser() user: CurrentUserData) {
    return this.storiesService.getArchive(user.userId);
  }

  /** Delete a story (author only). */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
  ): Promise<void> {
    return this.storiesService.delete(id, user.userId);
  }

  /** Record a view on a story (idempotent). */
  @Post(':id/view')
  @UseGuards(JwtAuthGuard)
  async view(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
  ): Promise<StoryView> {
    return this.storiesService.view(id, user.userId);
  }

  /** Get all viewers of a story. */
  @Get(':id/views')
  async getViews(@Param('id') id: string) {
    return this.storiesService.getViews(id);
  }

  /** Add or update a reaction on a story. */
  @Post(':id/react')
  @UseGuards(JwtAuthGuard)
  async react(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: StoryReactionDto,
  ): Promise<StoryReaction> {
    return this.storiesService.addReaction(id, user.userId, dto.reaction);
  }

  /** Get all reactions for a story. */
  @Get(':id/reactions')
  async getReactions(
    @Param('id') id: string,
  ): Promise<StoryReactionWithUser[]> {
    return this.storiesService.getReactions(id);
  }
}
