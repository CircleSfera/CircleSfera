import {
  Controller,
  Delete,
  Get,
  Inject,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { SearchHistory } from '../types/prisma.js';
import { SearchService } from './search.service.js';

/** REST controller for combined search, trending, user search, and search history. */
@Controller('search')
export class SearchController {
  constructor(
    @Inject(SearchService) private readonly searchService: SearchService,
  ) {}

  /** Search for users and hashtags by text query. */
  @Get()
  @UseGuards(JwtAuthGuard)
  async search(
    @Query('q') query: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<any> {
    const results = await this.searchService.search(query, user.userId);
    return results;
  }

  /** Get trending posts based on interaction velocity. */
  @Get('trending')
  @UseGuards(JwtAuthGuard)
  async getTrending(@Query('limit') limit?: number): Promise<any[]> {
    return this.searchService.getTrending(limit ? Number(limit) : 10);
  }

  /** Search posts with velocity ranking. */
  @Get('posts')
  @UseGuards(JwtAuthGuard)
  async searchPosts(@Query('q') query: string): Promise<any[]> {
    return this.searchService.searchPosts(query);
  }

  /** AI Semantic search for posts. */
  @Get('ai')
  @UseGuards(JwtAuthGuard)
  async searchSemantic(@Query('q') query: string): Promise<any[]> {
    return this.searchService.semanticSearchPosts(query);
  }

  /** AI Semantic search for profiles. */
  @Get('ai/profiles')
  @UseGuards(JwtAuthGuard)
  async searchSemanticProfiles(
    @Query('q') query: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<any[]> {
    return this.searchService.semanticSearchProfiles(query, 10, user.userId);
  }

  /** Search for users by username or full name with Social Discovery ranking. */
  @Get('users')
  @UseGuards(JwtAuthGuard)
  async searchUsers(
    @Query('q') query: string,
    @CurrentUser() user: CurrentUserData,
  ): Promise<any[]> {
    return this.searchService.searchUsers(query, user.userId);
  }

  /** Get the user's recent search history. */
  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getHistory(
    @CurrentUser() user: CurrentUserData,
  ): Promise<SearchHistory[]> {
    return await this.searchService.getHistory(user.userId);
  }

  /** Clear the user's search history. */
  @Delete('history')
  @UseGuards(JwtAuthGuard)
  async clearHistory(@CurrentUser() user: CurrentUserData): Promise<any> {
    return await this.searchService.clearHistory(user.userId);
  }
}
