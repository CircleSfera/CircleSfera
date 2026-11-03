import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import type { LiveAudience } from '@prisma/client';
import type { Request } from 'express';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { IdentityVerifiedGuard } from '../auth/guards/identity-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { InviteCoHostDto } from './dto/invite-cohost.dto.js';
import { InviteGuestDto } from './dto/invite-guest.dto.js';
import { SendGiftDto } from './dto/send-gift.dto.js';
import { StartStreamDto } from './dto/start-stream.dto.js';
import { LiveService } from './live.service.js';
import { LiveGiftService } from './live-gift.service.js';
import { LiveScheduleService } from './live-schedule.service.js';
import { LiveStartNoticeService } from './live-start-notice.service.js';

@Controller('live')
@UseGuards(JwtAuthGuard)
export class LiveController {
  constructor(
    private readonly liveService: LiveService,
    private readonly liveGiftService: LiveGiftService,
    private readonly startNotice: LiveStartNoticeService,
    private readonly schedule: LiveScheduleService,
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
      dto.audience,
      dto.scheduledLiveId,
    );
    // The followers it is for are told once the live exists: none for a
    // practice. Not waited for: the host is on air whether or not everyone
    // has been told yet.
    if (started.stream.audience !== 'PRACTICE') {
      void this.tellStarted(
        started.stream.id,
        user.profileId,
        started.stream.audience,
        dto.scheduledLiveId,
      );
    }
    return started;
  }

  // Those who asked to be reminded of the scheduled live it started from
  // are told first, then the followers not told yet. Neither throws.
  private async tellStarted(
    streamId: string,
    hostProfileId: string,
    audience: LiveAudience,
    scheduledLiveId?: string,
  ) {
    const reminded = scheduledLiveId
      ? await this.schedule.tellStarted(scheduledLiveId, streamId)
      : [];
    await this.startNotice.tellFollowers(
      streamId,
      hostProfileId,
      audience,
      reminded,
    );
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
    return this.liveService.getViewerToken(streamId, user.profileId);
  }

  @Post(':streamId/guests')
  @ApiResponse({ status: 201 })
  inviteGuest(
    @CurrentUser() user: CurrentUserData,
    @Param('streamId') streamId: string,
    @Body() dto: InviteGuestDto,
  ) {
    return this.liveService.inviteGuest(
      streamId,
      user.profileId,
      dto.profileId
        ? { profileId: dto.profileId }
        : { userId: dto.userId as string },
    );
  }

  @Post(':streamId/guests/accept')
  @ApiResponse({ status: 201 })
  acceptGuestInvite(
    @CurrentUser() user: CurrentUserData,
    @Param('streamId') streamId: string,
  ) {
    return this.liveService.acceptGuestInvite(streamId, user.profileId);
  }

  @Post(':streamId/guests/decline')
  @ApiResponse({ status: 201 })
  declineGuestInvite(
    @CurrentUser() user: CurrentUserData,
    @Param('streamId') streamId: string,
  ) {
    return this.liveService.declineGuestInvite(streamId, user.profileId);
  }

  @Post(':streamId/guests/leave')
  @ApiResponse({ status: 201 })
  leaveAsGuest(
    @CurrentUser() user: CurrentUserData,
    @Param('streamId') streamId: string,
  ) {
    return this.liveService.leaveAsGuest(streamId, user.profileId);
  }

  @Delete(':streamId/guests/:profileId')
  @ApiResponse({ status: 200 })
  removeGuest(
    @CurrentUser() user: CurrentUserData,
    @Param('streamId') streamId: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ) {
    return this.liveService.removeGuest(streamId, user.profileId, profileId);
  }

  // Kept for the apps still installed that invite one co-host: the invite
  // of a guest, answered as the invite of a co-host was.
  @Post(':streamId/cohost/invite')
  @ApiResponse({ status: 201 })
  async inviteCoHost(
    @CurrentUser() user: CurrentUserData,
    @Param('streamId') streamId: string,
    @Body() dto: InviteCoHostDto,
  ) {
    const invited = await this.liveService.inviteGuest(
      streamId,
      user.profileId,
      dto.coHostProfileId
        ? { profileId: dto.coHostProfileId }
        : { userId: dto.coHostUserId as string },
    );
    return { success: true, coHostId: invited.profileId };
  }

  // Kept for the apps still installed that accept to be a co-host.
  @Post(':streamId/cohost/accept')
  @ApiResponse({ status: 201 })
  acceptCoHostInvite(
    @CurrentUser() user: CurrentUserData,
    @Param('streamId') streamId: string,
  ) {
    return this.liveService.acceptGuestInvite(streamId, user.profileId);
  }

  // Kept for the apps still installed that remove the one co-host: every
  // guest invited or on air is removed.
  @Delete(':streamId/cohost')
  @ApiResponse({ status: 200 })
  removeCoHost(
    @CurrentUser() user: CurrentUserData,
    @Param('streamId') streamId: string,
  ) {
    return this.liveService.removeAllGuests(streamId, user.profileId);
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
