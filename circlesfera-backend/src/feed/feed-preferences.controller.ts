import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { FeedPreferencesService } from './feed-preferences.service.js';

class MuteKeywordDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(64)
  keyword!: string;
}

interface RequestWithUser extends Request {
  user: { userId: string; email: string; role: string };
}

@Controller('feed/preferences')
@UseGuards(JwtAuthGuard)
export class FeedPreferencesController {
  constructor(private readonly feedPreferences: FeedPreferencesService) {}

  @Get()
  list(@Req() req: RequestWithUser) {
    return this.feedPreferences.listPreferences(req.user.userId);
  }

  @Post('hide-post/:postId')
  hidePost(@Req() req: RequestWithUser, @Param('postId') postId: string) {
    return this.feedPreferences.hidePost(req.user.userId, postId);
  }

  @Delete('hide-post/:postId')
  unhidePost(@Req() req: RequestWithUser, @Param('postId') postId: string) {
    return this.feedPreferences.unhidePost(req.user.userId, postId);
  }

  @Post('hide-author/:authorId')
  hideAuthor(@Req() req: RequestWithUser, @Param('authorId') authorId: string) {
    return this.feedPreferences.hideAuthor(req.user.userId, authorId);
  }

  @Delete('hide-author/:authorId')
  unhideAuthor(
    @Req() req: RequestWithUser,
    @Param('authorId') authorId: string,
  ) {
    return this.feedPreferences.unhideAuthor(req.user.userId, authorId);
  }

  @Post('mute-keyword')
  muteKeyword(@Req() req: RequestWithUser, @Body() dto: MuteKeywordDto) {
    return this.feedPreferences.muteKeyword(req.user.userId, dto.keyword);
  }

  @Delete('mute-keyword/:keyword')
  unmuteKeyword(
    @Req() req: RequestWithUser,
    @Param('keyword') keyword: string,
  ) {
    return this.feedPreferences.unmuteKeyword(req.user.userId, keyword);
  }
}
