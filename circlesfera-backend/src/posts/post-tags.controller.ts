import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PostTagsService } from './post-tags.service.js';

// The active Profile's own tags on posts. Kept to the Profile itself.
@ApiTags('Post tags')
@Controller('post-tags')
@UseGuards(JwtAuthGuard)
export class PostTagsController {
  constructor(private readonly tags: PostTagsService) {}

  // Waiting for approval (`status=PENDING`) or shown on the profile (the
  // default).
  @Get()
  @ApiQuery({ name: 'status', required: false, enum: ['SHOWN', 'PENDING'] })
  @ApiResponse({ status: 200 })
  list(@CurrentUser() user: CurrentUserData, @Query('status') status?: string) {
    return this.tags.list(
      user.profileId,
      status === 'PENDING' ? 'PENDING' : 'SHOWN',
    );
  }

  @Post(':postId/approve')
  @ApiResponse({ status: 201 })
  approve(
    @CurrentUser() user: CurrentUserData,
    @Param('postId', ParseUUIDPipe) postId: string,
  ) {
    return this.tags.approve(postId, user.profileId);
  }

  @Delete(':postId')
  @ApiResponse({ status: 200 })
  remove(
    @CurrentUser() user: CurrentUserData,
    @Param('postId', ParseUUIDPipe) postId: string,
  ) {
    return this.tags.remove(postId, user.profileId);
  }
}
