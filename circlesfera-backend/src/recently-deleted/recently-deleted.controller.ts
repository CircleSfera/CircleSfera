import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { MemberAllowed } from '../team/member-allowed.decorator.js';
import { RecentlyDeletedService } from './recently-deleted.service.js';

// The session's Recently deleted: the posts, frames and stories its Profile
// deleted in the last 30 days. The service checks that each one is theirs.
@ApiTags('Recently deleted')
@Controller()
@UseGuards(JwtAuthGuard)
export class RecentlyDeletedController {
  constructor(private readonly recentlyDeleted: RecentlyDeletedService) {}

  @Get('users/me/recently-deleted')
  @MemberAllowed('content.manage')
  @ApiResponse({ status: 200 })
  list(@CurrentUser() user: CurrentUserData) {
    return this.recentlyDeleted.list(user.profileId);
  }

  @Post('posts/:id/restore')
  @MemberAllowed('content.manage')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200 })
  restorePost(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.recentlyDeleted.restorePost(user.profileId, id);
  }

  @Delete('posts/:id/permanent')
  @MemberAllowed('content.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  async erasePost(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.recentlyDeleted.erasePost(user.profileId, id);
  }

  @Post('stories/:id/restore')
  @MemberAllowed('content.manage')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200 })
  restoreStory(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.recentlyDeleted.restoreStory(user.profileId, id);
  }

  @Delete('stories/:id/permanent')
  @MemberAllowed('content.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  async eraseStory(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.recentlyDeleted.eraseStory(user.profileId, id);
  }
}
