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
import { InviteCoHostDto } from './dto/invite-cohost.dto.js';
import { SendGiftDto } from './dto/send-gift.dto.js';
import { StartStreamDto } from './dto/start-stream.dto.js';
import { LiveService } from './live.service.js';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email: string;
    role: string;
  };
}

@Controller('live')
@UseGuards(JwtAuthGuard)
export class LiveController {
  constructor(private readonly liveService: LiveService) {}

  @Post('start')
  startStream(@Req() req: RequestWithUser, @Body() dto: StartStreamDto) {
    return this.liveService.startStream(req.user.userId, dto.title);
  }

  @Post('end')
  endStream(@Req() req: RequestWithUser) {
    return this.liveService.endStream(req.user.userId);
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
    return this.liveService.getViewerToken(streamId, req.user.userId);
  }

  @Post(':streamId/cohost/invite')
  inviteCoHost(
    @Req() req: RequestWithUser,
    @Param('streamId') streamId: string,
    @Body() dto: InviteCoHostDto,
  ) {
    return this.liveService.inviteCoHost(
      streamId,
      req.user.userId,
      dto.coHostUserId,
    );
  }

  @Post(':streamId/cohost/accept')
  acceptCoHostInvite(
    @Req() req: RequestWithUser,
    @Param('streamId') streamId: string,
  ) {
    return this.liveService.acceptCoHostInvite(streamId, req.user.userId);
  }

  @Delete(':streamId/cohost')
  removeCoHost(
    @Req() req: RequestWithUser,
    @Param('streamId') streamId: string,
  ) {
    return this.liveService.removeCoHost(streamId, req.user.userId);
  }

  @Post(':streamId/gift')
  sendGift(
    @Req() req: RequestWithUser,
    @Param('streamId') streamId: string,
    @Body() dto: SendGiftDto,
  ) {
    return this.liveService.sendGift(
      streamId,
      req.user.userId,
      dto.giftId,
      dto.price,
    );
  }
}
