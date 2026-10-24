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
import { ApiResponse } from '@nestjs/swagger';
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
import { LiveGiftService } from './live-gift.service.js';
import { LiveStartNoticeService } from './live-start-notice.service.js';

@Controller('live')
@UseGuards(JwtAuthGuard)
export class LiveController {
  constructor(
    private readonly liveService: LiveService,
    private readonly liveGiftService: LiveGiftService,
    private readonly startNotice: LiveStartNoticeService,
  ) {}

  @Post('start')
  @UseGuards(EmailVerifiedGuard)
  @ApiResponse({ status: 201, type: Object })
  async startStream(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: StartStreamDto,
  ) {
    const started = await this.liveService.startStream(
      user.profileId,
      dto.title,
    );
    // The followers are told once the live exists. Not waited for: the host
    // is on air whether or not everyone has been told yet.
    void this.startNotice.tellFollowers(started.stream.id, user.profileId);
    return started;
  }

  @Post('end')
  @ApiResponse({ status: 201 })
  endStream(@CurrentUser() user: CurrentUserData) {
    return this.liveService.endStream(user.profileId);
  }

  @Get('active')
  @ApiResponse({ status: 200 })
  getActiveStreams(@CurrentUser() user: CurrentUserData) {
    return this.liveService.getActiveStreams(user.profileId);
  }

  @Get(':streamId')
  @ApiResponse({ status: 200 })
  getStream(
    @CurrentUser() user: CurrentUserData,
    @Param('streamId') streamId: string,
  ) {
    return this.liveService.getStream(streamId, user.profileId);
  }

  @Get('join/:streamId')
  @ApiResponse({ status: 200 })
  joinStream(
    @CurrentUser() user: CurrentUserData,
    @Param('streamId') streamId: string,
  ) {
    return this.liveService.getViewerToken(
      streamId,
      user.userId,
      user.profileId,
    );
  }

  @Post(':streamId/cohost/invite')
  @ApiResponse({ status: 201 })
  inviteCoHost(
    @CurrentUser() user: CurrentUserData,
    @Param('streamId') streamId: string,
    @Body() dto: InviteCoHostDto,
  ) {
    return this.liveService.inviteCoHost(
      streamId,
      user.profileId,
      dto.coHostProfileId
        ? { profileId: dto.coHostProfileId }
        : { userId: dto.coHostUserId as string },
    );
  }

  @Post(':streamId/cohost/accept')
  @ApiResponse({ status: 201 })
  acceptCoHostInvite(
    @CurrentUser() user: CurrentUserData,
    @Param('streamId') streamId: string,
  ) {
    return this.liveService.acceptCoHostInvite(streamId, user.profileId);
  }

  @Delete(':streamId/cohost')
  @ApiResponse({ status: 200 })
  removeCoHost(
    @CurrentUser() user: CurrentUserData,
    @Param('streamId') streamId: string,
  ) {
    return this.liveService.removeCoHost(streamId, user.profileId);
  }

  @Post(':streamId/gift')
  @UseGuards(IdentityVerifiedGuard)
  @ApiResponse({ status: 201, type: Object })
  sendGift(
    @Req() req: Request,
    @CurrentUser() user: CurrentUserData,
    @Param('streamId') streamId: string,
    @Body() dto: SendGiftDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const returnUrl =
      dto.returnUrl || `${req.protocol}://${req.get('host')}/live/${streamId}`;
    return this.liveGiftService.sendGift(
      streamId,
      user.userId,
      dto.giftId,
      returnUrl,
      idempotencyKey,
      user.profileId,
    );
  }
}
