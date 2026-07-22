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

  @Get(':streamId')
  getStream(@Param('streamId') streamId: string) {
    return this.liveService.getStream(streamId);
  }

  @Get('join/:streamId')
  joinStream(@Req() req: RequestWithUser, @Param('streamId') streamId: string) {
    return this.liveService.getViewerToken(streamId, req.user.sub);
  }

  @Post(':streamId/cohost/invite')
  inviteCoHost(
    @Req() req: RequestWithUser,
    @Param('streamId') streamId: string,
    @Body('coHostUserId') coHostUserId: string,
  ) {
    return this.liveService.inviteCoHost(streamId, req.user.sub, coHostUserId);
  }

  @Post(':streamId/cohost/accept')
  acceptCoHostInvite(
    @Req() req: RequestWithUser,
    @Param('streamId') streamId: string,
  ) {
    return this.liveService.acceptCoHostInvite(streamId, req.user.sub);
  }

  @Delete(':streamId/cohost')
  removeCoHost(
    @Req() req: RequestWithUser,
    @Param('streamId') streamId: string,
  ) {
    return this.liveService.removeCoHost(streamId, req.user.sub);
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
