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
import { ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { RequireOwnership } from '../auth/decorators/require-ownership.decorator.js';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { OwnershipGuard } from '../auth/guards/ownership.guard.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { FindPostsQueryDto } from './dto/find-posts-query.dto.js';
import { GetPostsDto } from './dto/get-posts.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { PostsService } from './posts.service.js';

/** REST controller for post CRUD, feed generation, discovery, and admin operations. */
@ApiTags('Posts')
@Controller('posts')
export class PostsController {
  constructor(
    @Inject(PostsService) private readonly postsService: PostsService,
  ) {}

  /** Create a new post (requires authentication). */
  @Post()
  @UseGuards(JwtAuthGuard, EmailVerifiedGuard)
  async create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreatePostDto,
  ) {
    return this.postsService.create(user.profileId, dto);
  }

  /** List all posts with optional sort (latest/trending). Supports guest access. */
  @Get()
  @UseGuards(JwtOptionalGuard)
  async findAll(
    @CurrentUser() user: CurrentUserData | null,
    @Query() query: GetPostsDto,
  ) {
    const { sort, ...pagination } = query;
    return this.postsService.findAll(pagination, sort, user?.profileId);
  }

  /** Get video-only feed (Frames/Reels). */
  @Get('frames')
  @UseGuards(JwtOptionalGuard)
  async getFrames(
    @CurrentUser() user: CurrentUserData | null,
    @Query() pagination: PaginationDto,
  ) {
    return this.postsService.getFramesFeed(pagination, user?.profileId);
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
      user?.profileId,
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
    return this.postsService.findOne(id, user?.profileId);
  }

  /** Update a post (author only). */
  @Put(':id')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @RequireOwnership({ model: 'Post' })
  async update(@Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.postsService.update(id, dto);
  }

  /** Delete a post (author only). */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @RequireOwnership({ model: 'Post' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.postsService.remove(id);
  }
  /** Admin-only post deletion (bypasses ownership check). */
  @Delete(':id/admin')
  @UseGuards(AdminJwtAuthGuard, AdminGuard)
  @RequireStaffPermissions('content')
  @HttpCode(HttpStatus.NO_CONTENT)
  async adminRemove(@Param('id') id: string) {
    await this.postsService.adminRemove(id);
  }
}
