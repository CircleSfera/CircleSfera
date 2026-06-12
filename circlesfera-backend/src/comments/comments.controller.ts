import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for metadata reflection
import { PaginationDto } from '../common/dto/pagination.dto.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for DI
import { CommentsService } from './comments.service.js';
// biome-ignore lint/style/useImportType: NestJS requires value import for metadata reflection
import { CreateCommentDto } from './dto/create-comment.dto.js';

/** REST controller for comments on posts. Supports creating, listing, and deleting comments. */
@Controller('posts/:postId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  /** Create a comment or reply on a post (requires auth). */
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Param('postId') postId: string,
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.create(postId, user.userId, dto);
  }

  /** List top-level comments with nested replies for a post. */
  @Get()
  async findByPost(
    @Param('postId') postId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.commentsService.findByPost(postId, pagination);
  }

  /** Delete a comment (author only). */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    await this.commentsService.remove(id, user.userId);
  }

  /** Like a comment. */
  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  async likeComment(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.commentsService.likeComment(id, user.userId);
    return { success: true };
  }

  /** Unlike a comment. */
  @Delete(':id/like')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlikeComment(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    await this.commentsService.unlikeComment(id, user.userId);
  }
}
