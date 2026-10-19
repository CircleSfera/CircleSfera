import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  FeedPreferencesService,
  PREFERENCE_PAGE_MAX,
} from './feed-preferences.service.js';

class MuteKeywordDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(64)
  keyword!: string;
}

class PreferencePageDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PREFERENCE_PAGE_MAX)
  limit?: number;
}

@Controller('feed/preferences')
@UseGuards(JwtAuthGuard)
export class FeedPreferencesController {
  constructor(private readonly feedPreferences: FeedPreferencesService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserData) {
    return this.feedPreferences.listPreferences(user.profileId);
  }

  // Each list a page at a time, most recent first.
  @Get('hidden-posts')
  hiddenPosts(
    @CurrentUser() user: CurrentUserData,
    @Query() q: PreferencePageDto,
  ) {
    return this.feedPreferences.listPage(
      user.profileId,
      'hidden-posts',
      q.cursor,
      q.limit,
    );
  }

  @Get('hidden-authors')
  hiddenAuthors(
    @CurrentUser() user: CurrentUserData,
    @Query() q: PreferencePageDto,
  ) {
    return this.feedPreferences.listPage(
      user.profileId,
      'hidden-authors',
      q.cursor,
      q.limit,
    );
  }

  @Get('muted-keywords')
  mutedKeywords(
    @CurrentUser() user: CurrentUserData,
    @Query() q: PreferencePageDto,
  ) {
    return this.feedPreferences.listPage(
      user.profileId,
      'muted-keywords',
      q.cursor,
      q.limit,
    );
  }

  @Post('hide-post/:postId')
  hidePost(
    @CurrentUser() user: CurrentUserData,
    @Param('postId') postId: string,
  ) {
    return this.feedPreferences.hidePost(user.profileId, postId);
  }

  @Delete('hide-post/:postId')
  unhidePost(
    @CurrentUser() user: CurrentUserData,
    @Param('postId') postId: string,
  ) {
    return this.feedPreferences.unhidePost(user.profileId, postId);
  }

  @Post('hide-author/:authorId')
  hideAuthor(
    @CurrentUser() user: CurrentUserData,
    @Param('authorId') authorId: string,
  ) {
    return this.feedPreferences.hideAuthor(user.profileId, authorId);
  }

  @Delete('hide-author/:authorId')
  unhideAuthor(
    @CurrentUser() user: CurrentUserData,
    @Param('authorId') authorId: string,
  ) {
    return this.feedPreferences.unhideAuthor(user.profileId, authorId);
  }

  @Post('mute-keyword')
  muteKeyword(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: MuteKeywordDto,
  ) {
    return this.feedPreferences.muteKeyword(user.profileId, dto.keyword);
  }

  @Delete('mute-keyword/:keyword')
  unmuteKeyword(
    @CurrentUser() user: CurrentUserData,
    @Param('keyword') keyword: string,
  ) {
    return this.feedPreferences.unmuteKeyword(user.profileId, keyword);
  }
}
