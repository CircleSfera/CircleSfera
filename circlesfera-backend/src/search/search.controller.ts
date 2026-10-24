import {
  Controller,
  Delete,
  Get,
  Inject,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiQuery, ApiResponse } from '@nestjs/swagger';
import type { SearchHistory } from '@prisma/client';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { MemberAllowed } from '../team/member-allowed.decorator.js';
import { SearchService } from './search.service.js';

// REST controller for combined search, trending, user search, and search history.
@Controller('search')
export class SearchController {
  constructor(
    @Inject(SearchService) private readonly searchService: SearchService,
  ) {}

  // Search for users and hashtags by text query.
  @ApiQuery({ name: 'verified', required: false })
  @Get()
  @MemberAllowed('browse')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200, type: Object })
  async search(
    @Query('q') query: string,
    @CurrentUser() user: CurrentUserData,
    @Query('verified') verified?: string,
  ): Promise<any> {
    const results = await this.searchService.search(
      query,
      user.profileId,
      verified === 'true',
    );
    return results;
  }

  // Get trending posts based on interaction velocity.
  @ApiQuery({ name: 'limit', required: false })
  @Get('trending')
  @MemberAllowed('browse')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200, type: [Object] })
  async getTrending(
    @CurrentUser() user: CurrentUserData,
    @Query('limit') limit?: number,
  ): Promise<any[]> {
    return this.searchService.getTrending(
      limit ? Number(limit) : 10,
      user.profileId,
    );
  }

  // Search posts with velocity ranking.
  @Get('posts')
  @MemberAllowed('browse')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200, type: [Object] })
  async searchPosts(
    @CurrentUser() user: CurrentUserData,
    @Query('q') query: string,
  ): Promise<any[]> {
    return this.searchService.searchPosts(query, user.profileId);
  }

  // AI Semantic search for posts.
  @Get('ai')
  @MemberAllowed('browse')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200, type: [Object] })
  async searchSemantic(
    @CurrentUser() user: CurrentUserData,
    @Query('q') query: string,
  ): Promise<any[]> {
    return this.searchService.semanticSearchPosts(query, 10, user.profileId);
  }

  // AI Semantic search for profiles.
  @Get('ai/profiles')
  @MemberAllowed('browse')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200, type: [Object] })
  async searchSemanticProfiles(
    @Query('q') query: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<any[]> {
    return this.searchService.semanticSearchProfiles(query, 10, user.profileId);
  }

  // Search for users by username or full name with Social Discovery ranking.
  @ApiQuery({ name: 'verified', required: false })
  @Get('users')
  @MemberAllowed('browse')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200, type: [Object] })
  async searchUsers(
    @Query('q') query: string,
    @CurrentUser() user: CurrentUserData,
    @Query('verified') verified?: string,
  ): Promise<any[]> {
    return this.searchService.searchUsers(
      query,
      user.profileId,
      verified === 'true',
    );
  }

  // Get the user's recent search history.
  @Get('history')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200 })
  async getHistory(
    @CurrentUser() user: CurrentUserData,
  ): Promise<SearchHistory[]> {
    return await this.searchService.getHistory(user.profileId);
  }

  // Clear the user's search history.
  @Delete('history')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200, type: Object })
  async clearHistory(@CurrentUser() user: CurrentUserData): Promise<any> {
    return await this.searchService.clearHistory(user.profileId);
  }
}
