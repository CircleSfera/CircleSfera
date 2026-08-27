import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { AnswerQnaDto } from './dto/answer-qna.dto.js';
import { CreatePollDto } from './dto/create-poll.dto.js';
import { CreateQnaBoxDto } from './dto/create-qna.dto.js';
import { VotePollDto } from './dto/vote-poll.dto.js';
import { InteractiveService } from './interactive.service.js';

@Controller('interactive')
export class InteractiveController {
  constructor(
    @Inject(InteractiveService)
    private readonly interactiveService: InteractiveService,
  ) {}

  @Post('poll')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createPoll(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreatePollDto,
  ) {
    return this.interactiveService.createPoll(user.profileId, dto);
  }

  @Get('poll/:id')
  @UseGuards(JwtOptionalGuard)
  async getPoll(
    @Param('id') id: string,
    @CurrentUser('profileId') profileId: string | null,
  ) {
    return this.interactiveService.getPoll(id, profileId ?? undefined);
  }

  @Post('poll/vote')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async votePoll(
    @CurrentUser() user: CurrentUserData,
    @Body() body: VotePollDto,
  ) {
    return this.interactiveService.votePoll(
      user.profileId,
      body.pollId,
      body.optionIndex,
    );
  }

  @Post('qna')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createQnaBox(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: CreateQnaBoxDto,
  ) {
    return this.interactiveService.createQnaBox(user.profileId, dto);
  }

  @Get('qna/:id')
  async getQnaBox(@Param('id') id: string) {
    return this.interactiveService.getQnaBox(id);
  }

  @Post('qna/answer')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async answerQna(
    @CurrentUser() user: CurrentUserData,
    @Body() body: AnswerQnaDto,
  ) {
    return this.interactiveService.answerQna(
      user.profileId,
      body.qnaBoxId,
      body.answerText,
    );
  }
}
