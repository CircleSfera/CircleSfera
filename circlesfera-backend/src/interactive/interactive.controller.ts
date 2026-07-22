import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AnswerQnaDto } from './dto/answer-qna.dto.js';
import { CreatePollDto } from './dto/create-poll.dto.js';
import { CreateQnaBoxDto } from './dto/create-qna.dto.js';
import { VotePollDto } from './dto/vote-poll.dto.js';
import { InteractiveService } from './interactive.service.js';

interface AuthRequest extends Request {
  user: { userId: string; email: string; role: string };
}

@Controller('interactive')
export class InteractiveController {
  constructor(
    @Inject(InteractiveService)
    private readonly interactiveService: InteractiveService,
  ) {}

  @Post('poll')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createPoll(@Req() req: AuthRequest, @Body() dto: CreatePollDto) {
    return this.interactiveService.createPoll(req.user.userId, dto);
  }

  @Get('poll/:id')
  async getPoll(@Param('id') id: string, @Req() req: Request) {
    const userId = (req as unknown as AuthRequest).user?.userId;
    return this.interactiveService.getPoll(id, userId);
  }

  @Post('poll/vote')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async votePoll(@Req() req: AuthRequest, @Body() body: VotePollDto) {
    return this.interactiveService.votePoll(
      req.user.userId,
      body.pollId,
      body.optionIndex,
    );
  }

  @Post('qna')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createQnaBox(@Req() req: AuthRequest, @Body() dto: CreateQnaBoxDto) {
    return this.interactiveService.createQnaBox(req.user.userId, dto);
  }

  @Get('qna/:id')
  async getQnaBox(@Param('id') id: string) {
    return this.interactiveService.getQnaBox(id);
  }

  @Post('qna/answer')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async answerQna(@Req() req: AuthRequest, @Body() body: AnswerQnaDto) {
    return this.interactiveService.answerQna(
      req.user.userId,
      body.qnaBoxId,
      body.answerText,
    );
  }
}
