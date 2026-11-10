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
import { ApiResponse, ApiTags } from '@nestjs/swagger';
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
import { MemberAllowed } from '../team/member-allowed.decorator.js';
import { refuseMemberPrice } from '../team/member-price.js';
import { RecordsActivity } from '../team/records-activity.decorator.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { FindPostsQueryDto } from './dto/find-posts-query.dto.js';
import { GetPostsDto } from './dto/get-posts.dto.js';
import { InviteCollaboratorDto } from './dto/invite-collaborator.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { PostCollaboratorsService } from './post-collaborators.service.js';
import { PostWhyService } from './post-why.service.js';
import { PostsService } from './posts.service.js';

// REST controller for post CRUD, feed generation, discovery, and admin operations.
@ApiTags('Posts')
@Controller('posts')
export class PostsController {
  constructor(
    @Inject(PostsService) private readonly postsService: PostsService,
    @Inject(PostWhyService) private readonly postWhyService: PostWhyService,
    @Inject(PostCollaboratorsService)
    private readonly collaborators: PostCollaboratorsService,
  ) {}

  // Create a new post (requires authentication).
  @Post()
  @UseGuards(JwtAuthGuard, EmailVerifiedGuard)
  @MemberAllowed('content.manage')
  @RecordsActivity('POST_PUBLISHED')
  @ApiResponse({ status: 201 })
  async create(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreatePostDto,
  ) {
    refuseMemberPrice(user, dto.priceCents);
    return this.postsService.create(user.profileId, dto);
  }

  // List all posts with optional sort (latest/trending). Supports guest access.
  @Get()
  @MemberAllowed('browse')
  @UseGuards(JwtOptionalGuard)
  @ApiResponse({ status: 200 })
  async findAll(
    @CurrentUser() user: CurrentUserData | null,
    @Query() query: GetPostsDto,
  ) {
    const { sort, ...pagination } = query;
    return this.postsService.findAll(pagination, sort, user?.profileId);
  }

  // Get video-only feed (Frames/Reels).
  @Get('frames')
  @MemberAllowed('browse')
  @UseGuards(JwtOptionalGuard)
  @ApiResponse({ status: 200 })
  async getFrames(
    @CurrentUser() user: CurrentUserData | null,
    @Query() pagination: PaginationDto,
  ) {
    return this.postsService.getFramesFeed(pagination, user?.profileId);
  }

  // Get posts by a specific user's username.
  @Get('user/:username')
  @MemberAllowed('browse')
  @UseGuards(JwtOptionalGuard)
  @ApiResponse({ status: 200 })
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

  // Get posts where a user has been tagged/mentioned.
  @Get('user/:username/tagged')
  @MemberAllowed('browse')
  @UseGuards(JwtOptionalGuard)
  @ApiResponse({ status: 200 })
  async getTaggedPosts(
    @CurrentUser() user: CurrentUserData | null,
    @Param('username') username: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.postsService.getTaggedPosts(
      username,
      pagination,
      user?.profileId,
    );
  }

  // Get posts filtered by hashtag.
  @Get('tags/:tag')
  @MemberAllowed('browse')
  @UseGuards(JwtOptionalGuard)
  @ApiResponse({ status: 200 })
  async getByTag(
    @CurrentUser() user: CurrentUserData | null,
    @Param('tag') tag: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.postsService.getByTag(tag, pagination, user?.profileId);
  }

  // Get a single post by ID. Supports guest access.
  // Why this post is shown to the viewer: the reasons true for them.
  @Get(':id/why')
  @MemberAllowed('browse')
  @UseGuards(JwtOptionalGuard)
  @ApiResponse({ status: 200, type: Object })
  async why(
    @CurrentUser() user: CurrentUserData | null,
    @Param('id') id: string,
  ) {
    return this.postWhyService.why(id, user?.profileId);
  }

  @Get(':id')
  @MemberAllowed('browse')
  @UseGuards(JwtOptionalGuard)
  @ApiResponse({ status: 200, type: Object })
  async findOne(
    @CurrentUser() user: CurrentUserData | null,
    @Param('id') id: string,
  ) {
    return this.postsService.findOne(id, user?.profileId);
  }

  // Update a post (author only).
  @Put(':id')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @RequireOwnership({ model: 'Post' })
  @MemberAllowed('content.manage')
  @RecordsActivity('POST_EDITED')
  @ApiResponse({ status: 200 })
  async update(@Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.postsService.update(id, dto);
  }

  // Delete a post (author only).
  @Delete(':id')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @RequireOwnership({ model: 'Post' })
  @MemberAllowed('content.manage')
  @RecordsActivity('POST_DELETED')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  async remove(@Param('id') id: string) {
    await this.postsService.remove(id);
  }
  // Pin a post or Frame to the top of one's profile (author only).
  @Post(':id/profile-pin')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @RequireOwnership({ model: 'Post' })
  @MemberAllowed('content.manage')
  @RecordsActivity('POST_EDITED')
  @ApiResponse({ status: 201 })
  async pinToProfile(@Param('id') id: string) {
    return this.postsService.pinToProfile(id);
  }

  // Unpin it (author only).
  @Delete(':id/profile-pin')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @RequireOwnership({ model: 'Post' })
  @MemberAllowed('content.manage')
  @RecordsActivity('POST_EDITED')
  @ApiResponse({ status: 200 })
  async unpinFromProfile(@Param('id') id: string) {
    return this.postsService.unpinFromProfile(id);
  }

  // The author's view of its collaborator, invited or accepted.
  @Get(':id/collaborator')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @RequireOwnership({ model: 'Post' })
  @MemberAllowed('content.manage')
  @ApiResponse({ status: 200 })
  async getCollaborator(@Param('id') id: string) {
    return this.collaborators.get(id);
  }

  // The author invites one Profile to author the post too.
  @Post(':id/collaborator')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @RequireOwnership({ model: 'Post' })
  @MemberAllowed('content.manage')
  @RecordsActivity('POST_EDITED')
  @ApiResponse({ status: 201 })
  async inviteCollaborator(
    @Param('id') id: string,
    @Body() dto: InviteCollaboratorDto,
  ) {
    return this.collaborators.invite(id, dto.username);
  }

  // The author withdraws the invitation or removes the collaborator.
  @Delete(':id/collaborator')
  @UseGuards(JwtAuthGuard, OwnershipGuard)
  @RequireOwnership({ model: 'Post' })
  @MemberAllowed('content.manage')
  @RecordsActivity('POST_EDITED')
  @ApiResponse({ status: 200 })
  async removeCollaborator(@Param('id') id: string) {
    return this.collaborators.remove(id);
  }

  // Admin-only post deletion (bypasses ownership check).
  @Delete(':id/admin')
  @UseGuards(AdminJwtAuthGuard, AdminGuard)
  @RequireStaffPermissions('content')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  async adminRemove(@Param('id') id: string) {
    await this.postsService.adminRemove(id);
  }
}
