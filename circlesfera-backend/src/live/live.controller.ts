import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { LiveService } from './live.service.js';

interface RequestWithUser extends Request {
  user: {
    sub: string;
    email: string;
  };
}

@Controller('live')
@UseGuards(JwtAuthGuard)
export class LiveController {
  constructor(private readonly liveService: LiveService) {}

  @Post('start')
  startStream(@Req() req: RequestWithUser, @Body('title') title?: string) {
    return this.liveService.startStream(req.user.sub, title);
  }

  @Post('end')
  endStream(@Req() req: RequestWithUser) {
    return this.liveService.endStream(req.user.sub);
  }

  @Get('active')
  getActiveStreams() {
    return this.liveService.getActiveStreams();
  }

  @Get('join/:streamId')
  joinStream(@Req() req: RequestWithUser, @Param('streamId') streamId: string) {
    return this.liveService.getViewerToken(streamId, req.user.sub);
  }

  @Post(':streamId/gift')
  sendGift(
    @Req() req: RequestWithUser,
    @Param('streamId') streamId: string,
    @Body('giftId') giftId: string,
    @Body('price') price: number,
  ) {
    return this.liveService.sendGift(streamId, req.user.sub, giftId, price);
  }
}
