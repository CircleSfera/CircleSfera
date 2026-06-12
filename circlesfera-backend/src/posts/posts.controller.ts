import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for metadata reflection
import { PaginationDto } from '../common/dto/pagination.dto.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for metadata reflection
import { CreatePostDto } from './dto/create-post.dto.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for metadata reflection
import { FindPostsQueryDto } from './dto/find-posts-query.dto.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for metadata reflection
import { GetPostsDto } from './dto/get-posts.dto.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for metadata reflection
import { UpdatePostDto } from './dto/update-post.dto.js';
import { PostsService } from './posts.service.js';

/** REST controller for post CRUD, feed generation, discovery, and admin operations. */
@Controller('posts')
export class PostsController {
  constructor(
    @Inject(PostsService) private readonly postsService: PostsService,
  ) {}

  /** Create a new post (requires authentication). */
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreatePostDto,
  ) {
    return this.postsService.create(user.userId, dto);
  }

  /** List all posts with optional sort (latest/trending). Supports guest access. */
  @Get()
  @UseGuards(JwtOptionalGuard)
  async findAll(
    @CurrentUser() user: CurrentUserData | null,
    @Query() query: GetPostsDto,
  ) {
    const { sort, ...pagination } = query;
    return this.postsService.findAll(pagination, sort, user?.userId);
  }

  /** Get personalized discovery feed (AI recommended). */
  @Get('explore')
  @UseGuards(JwtOptionalGuard)
  async getExplore(
    @CurrentUser() user: CurrentUserData | null,
    @Query() pagination: PaginationDto,
  ) {
    return this.postsService.getDiscoveryFeed(user?.userId || null, pagination);
  }
  /** Get video-only feed (Frames/Reels). */
  @Get('frames')
  @UseGuards(JwtOptionalGuard)
  async getFrames(
    @CurrentUser() user: CurrentUserData | null,
    @Query() pagination: PaginationDto,
  ) {
    return this.postsService.getFramesFeed(pagination, user?.userId);
  }

  /** Get personalized feed from followed users (requires authentication). */
  @Get('feed')
  @UseGuards(JwtAuthGuard)
  async getFeed(
    @CurrentUser() user: CurrentUserData | null,
    @Query() pagination: PaginationDto,
  ) {
    if (!user) {
      return {
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
      };
    }
    return this.postsService.getFeed(user.userId, pagination);
  }

  /** Get posts by a specific user's username. */
  @Get('user/:username')
  @UseGuards(JwtOptionalGuard)
  async findByUser(
    @CurrentUser() user: CurrentUserData | null,
    @Param('username') username: string,
    @Query() query: FindPostsQueryDto,
  ) {
    const { type, ...pagination } = query;
    return this.postsService.findByUser(
      username,
      pagination,
      type,
      user?.userId,
    );
  }

  /** Get posts where a user has been tagged/mentioned. */
  @Get('user/:username/tagged')
  async getTaggedPosts(
    @Param('username') username: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.postsService.getTaggedPosts(username, pagination);
  }

  /** Get posts filtered by hashtag. */
  @Get('tags/:tag')
  async getByTag(
    @Param('tag') tag: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.postsService.getByTag(tag, pagination);
  }

  /** Get a single post by ID. Supports guest access. */
  @Get(':id')
  @UseGuards(JwtOptionalGuard)
  async findOne(
    @CurrentUser() user: CurrentUserData | null,
    @Param('id') id: string,
  ) {
    return this.postsService.findOne(id, user?.userId);
  }

  /** Update a post (author only). */
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: UpdatePostDto,
  ) {
    return this.postsService.update(id, user.userId, dto);
  }

  /** Delete a post (author only). */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    await this.postsService.remove(id, user.userId);
  }
  /** Admin-only post deletion (bypasses ownership check). */
  @Delete(':id/admin')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async adminRemove(@Param('id') id: string) {
    await this.postsService.adminRemove(id);
  }
}
