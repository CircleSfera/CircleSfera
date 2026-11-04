import { HIDDEN_WORD_MAX_LENGTH } from '@circlesfera/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { HiddenWordsService } from './hidden-words.service.js';

class HiddenWordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(HIDDEN_WORD_MAX_LENGTH)
  word!: string;
}

// The active Profile's hidden words. Kept to the owner: no team member
// changes what a Profile hides.
@Controller('hidden-words')
@UseGuards(JwtAuthGuard)
export class HiddenWordsController {
  constructor(private readonly hiddenWords: HiddenWordsService) {}

  @Get()
  @ApiResponse({ status: 200 })
  list(@CurrentUser() user: CurrentUserData) {
    return this.hiddenWords.list(user.profileId);
  }

  @Post()
  @ApiResponse({ status: 201 })
  add(@CurrentUser() user: CurrentUserData, @Body() dto: HiddenWordDto) {
    return this.hiddenWords.add(user.profileId, dto.word);
  }

  @Delete(':word')
  @ApiResponse({ status: 200 })
  remove(@CurrentUser() user: CurrentUserData, @Param('word') word: string) {
    return this.hiddenWords.remove(user.profileId, word);
  }
}
