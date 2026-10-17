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
import { RespondStoryStickerDto } from '../story-stickers/dto/story-sticker.dto.js';
import { StoryStickersService } from '../story-stickers/story-stickers.service.js';
import { MemberAllowed } from '../team/member-allowed.decorator.js';
import { refuseMemberPrice } from '../team/member-price.js';
import { RecordsActivity } from '../team/records-activity.decorator.js';
import { CreateStoryDto } from './dto/create-story.dto.js';
import { StoryReactionDto } from './dto/story-reaction.dto.js';
import { StoriesService } from './stories.service.js';

// REST controller for ephemeral stories, views, and reactions.
@Controller('stories')
export class StoriesController {
  constructor(
    private readonly storiesService: StoriesService,
    private readonly stickers: StoryStickersService,
  ) {}

  // Create a new 24-hour ephemeral story.
  @Post()
  @UseGuards(JwtAuthGuard, EmailVerifiedGuard)
  @MemberAllowed('content.manage')
  @RecordsActivity('STORY_PUBLISHED')
  create(
    @CurrentUser() user: CurrentUserData,
    @Body() createStoryDto: CreateStoryDto,
  ) {
    refuseMemberPrice(user, createStoryDto.priceCents);
    return this.storiesService.create(user.profileId, createStoryDto);
  }

  // List all active stories (filtered by followed users).
  @Get()
  @MemberAllowed('browse')
  @UseGuards(JwtOptionalGuard)
  findAll(@CurrentUser() user: CurrentUserData | null) {
    return this.storiesService.findAll(user?.profileId);
  }

  // Get active stories by a specific user.
  @Get('user/:username')
  @MemberAllowed('browse')
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
  @MemberAllowed('content.manage')
  @RecordsActivity('STORY_DELETED')
  async remove(@Param('id') id: string): Promise<void> {
    return this.storiesService.delete(id);
  }

  // Answer a sticker of a story: vote in a poll or a quiz, move a slider or
  // answer a question. Answers what the sticker has gathered since.
  @Post('stickers/:id/responses')
  @UseGuards(JwtAuthGuard, EmailVerifiedGuard)
  respondToSticker(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Body() dto: RespondStoryStickerDto,
  ) {
    return this.stickers.respond(user.profileId, id, dto);
  }

  // What a sticker has gathered, for someone who may see its story; the
  // answers to a question only for the author.
  @Get('stickers/:id')
  @MemberAllowed('browse')
  @UseGuards(JwtAuthGuard)
  stickerResults(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
  ) {
    return this.stickers.results(user.profileId, id);
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
  // pagination: pass `cursor` (opaque, from the previous page's
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

  // Get reactions for a story. The author reads who reacted; anyone else
  // who can see the story reads only their own reaction. Cursor pagination:
  // pass `cursor` (opaque, from the previous page's nextCursor) to fetch
  // the next page.
  @Get(':id/reactions')
  @UseGuards(JwtAuthGuard)
  async getReactions(
    @CurrentUser() user: CurrentUserData,
    @Param('id') id: string,
    @Query() query: PaginationDto,
  ) {
    return this.storiesService.getReactions(
      id,
      user.profileId,
      query.cursor,
      query.limit,
    );
  }
}
