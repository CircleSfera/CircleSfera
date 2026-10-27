import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { MemberAllowed } from '../team/member-allowed.decorator.js';
import {
  ARCHIVE_PAGE_MAX,
  type ArchivedKind,
  ArchiveService,
} from './archive.service.js';

export class ArchivePageDto {
  @IsIn(['POST', 'FRAME'])
  type!: ArchivedKind;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ARCHIVE_PAGE_MAX)
  limit?: number;
}

// The session's archive of posts and frames. The service checks that each
// one is theirs. The story archive is GET /stories/archive.
@ApiTags('Archive')
@Controller()
@UseGuards(JwtAuthGuard)
export class ArchiveController {
  constructor(private readonly archive: ArchiveService) {}

  @Get('users/me/archive/posts')
  @MemberAllowed('content.manage')
  @ApiResponse({ status: 200 })
  list(@CurrentUser() user: CurrentUserData, @Query() q: ArchivePageDto) {
    return this.archive.list(user.profileId, q.type, q.cursor, q.limit);
  }

  @Post('posts/:id/archive')
  @MemberAllowed('content.manage')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200 })
  archivePost(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.archive.archive(user.profileId, id);
  }

  @Post('posts/:id/unarchive')
  @MemberAllowed('content.manage')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200 })
  unarchivePost(
    @CurrentUser() user: CurrentUserData,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.archive.unarchive(user.profileId, id);
  }
}
