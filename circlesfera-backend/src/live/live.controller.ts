import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { IdentityVerifiedGuard } from '../auth/guards/identity-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { InviteCoHostDto } from './dto/invite-cohost.dto.js';
import { SendGiftDto } from './dto/send-gift.dto.js';
import { StartStreamDto } from './dto/start-stream.dto.js';
import { LiveService } from './live.service.js';

@Controller('live')
@UseGuards(JwtAuthGuard)
export class LiveController {
  constructor(private readonly liveService: LiveService) {}

  @Post('start')
  @UseGuards(EmailVerifiedGuard)
  startStream(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: StartStreamDto,
  ) {
    return this.liveService.startStream(user.profileId, dto.title);
  }

  @Post('end')
  endStream(@CurrentUser() user: CurrentUserData) {
    return this.liveService.endStream(user.profileId);
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
  joinStream(
    @CurrentUser() user: CurrentUserData,
    @Param('streamId') streamId: string,
  ) {
    return this.liveService.getViewerToken(streamId, user.userId);
  }

  @Post(':streamId/cohost/invite')
  inviteCoHost(
    @CurrentUser() user: CurrentUserData,
    @Param('streamId') streamId: string,
    @Body() dto: InviteCoHostDto,
  ) {
    return this.liveService.inviteCoHost(
      streamId,
      user.profileId,
      dto.coHostUserId,
    );
  }

  @Post(':streamId/cohost/accept')
  acceptCoHostInvite(
    @CurrentUser() user: CurrentUserData,
    @Param('streamId') streamId: string,
  ) {
    return this.liveService.acceptCoHostInvite(streamId, user.profileId);
  }

  @Delete(':streamId/cohost')
  removeCoHost(
    @CurrentUser() user: CurrentUserData,
    @Param('streamId') streamId: string,
  ) {
    return this.liveService.removeCoHost(streamId, user.profileId);
  }

  @Post(':streamId/gift')
  @UseGuards(IdentityVerifiedGuard)
  sendGift(
    @Req() req: Request,
    @CurrentUser() user: CurrentUserData,
    @Param('streamId') streamId: string,
    @Body() dto: SendGiftDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const returnUrl =
      dto.returnUrl || `${req.protocol}://${req.get('host')}/live/${streamId}`;
    return this.liveService.sendGift(
      streamId,
      user.userId,
      dto.giftId,
      returnUrl,
      idempotencyKey,
    );
  }
}
