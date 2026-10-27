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
import { ApiResponse } from '@nestjs/swagger';
import {
  CurrentUser,
  type CurrentUserData,
} from '../../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { ListPublishedRecordingsDto } from './dto/list-published-recordings.dto.js';
import { LiveRecordingsService } from './live-recordings.service.js';

/**
 * The recordings of broadcasts: the host's archive and choices, and a
 * Profile's published "Lives". Every choice is the host's own, checked here
 * on the server.
 */
@Controller('live-recordings')
@UseGuards(JwtAuthGuard)
export class LiveRecordingsController {
  constructor(private readonly recordings: LiveRecordingsService) {}

  @Get('mine')
  @ApiResponse({ status: 200 })
  listArchive(@CurrentUser() user: CurrentUserData) {
    return this.recordings.listArchive(user.profileId);
  }

  @Get('profile/:profileId')
  @ApiResponse({ status: 200 })
  listPublished(
    @CurrentUser() user: CurrentUserData,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Query() query: ListPublishedRecordingsDto,
  ) {
    return this.recordings.listPublished(
      profileId,
      user.profileId,
      query.cursor,
      query.limit,
    );
  }

  @Get(':streamId')
  @ApiResponse({ status: 200 })
  getOwn(
    @CurrentUser() user: CurrentUserData,
    @Param('streamId', ParseUUIDPipe) streamId: string,
  ) {
    return this.recordings.getOwn(user.profileId, streamId);
  }

  @Post(':streamId/publish')
  @ApiResponse({ status: 201 })
  publish(
    @CurrentUser() user: CurrentUserData,
    @Param('streamId', ParseUUIDPipe) streamId: string,
  ) {
    return this.recordings.publish(user.profileId, streamId);
  }

  @Delete(':streamId')
  @ApiResponse({ status: 200 })
  remove(
    @CurrentUser() user: CurrentUserData,
    @Param('streamId', ParseUUIDPipe) streamId: string,
  ) {
    return this.recordings.remove(user.profileId, streamId);
  }
}
