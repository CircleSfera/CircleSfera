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

  @Get('poll/:id')
  async getPoll(@Param('id') id: string, @Req() req: Request) {
    const userId = (req as unknown as AuthRequest).user?.userId;
    return this.interactiveService.getPoll(id, userId);
  }

  @Post('poll/vote')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async votePoll(
    @Req() req: AuthRequest,
    @Body() body: { pollId: string; optionIndex: number },
  ) {
    return this.interactiveService.votePoll(
      req.user.userId,
      body.pollId,
      body.optionIndex,
    );
  }

  @Get('qna/:id')
  async getQnaBox(@Param('id') id: string) {
    return this.interactiveService.getQnaBox(id);
  }

  @Post('qna/answer')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async answerQna(
    @Req() req: AuthRequest,
    @Body() body: { qnaBoxId: string; answerText: string },
  ) {
    return this.interactiveService.answerQna(
      req.user.userId,
      body.qnaBoxId,
      body.answerText,
    );
  }
}
