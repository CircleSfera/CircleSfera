import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  CurrentUser,
  type CurrentUserData,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { clientIp } from '../common/abuse/device-signal.service.js';
import { MemberAllowed } from '../team/member-allowed.decorator.js';
import { BusinessStatsService } from './business-stats.service.js';
import { RecordBusinessStatDto } from './dto/record-business-stat.dto.js';

@ApiTags('business-stats')
@Controller('business-stats')
export class BusinessStatsController {
  constructor(
    @Inject(BusinessStatsService)
    private readonly stats: BusinessStatsService,
  ) {}

  // A visit to a Business Profile, or a tap on one of its buttons. Anyone
  // may send it, signed in or not; it counts once a day per person.
  @Post(':profileId/events')
  @UseGuards(JwtOptionalGuard)
  @MemberAllowed('browse')
  @Throttle({ short: { limit: 60, ttl: 60000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204 })
  async record(
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() body: RecordBusinessStatDto,
    @CurrentUser() user: CurrentUserData | null,
    @Req() req: Request,
  ): Promise<void> {
    await this.stats.record(
      profileId,
      body.kind,
      user?.userId ?? null,
      user ? null : (clientIp(req) ?? null),
    );
  }

  // The statistics of the Business Profile in use, for its owner and the
  // team members whose role reads analytics.
  @Get()
  @UseGuards(JwtAuthGuard)
  @MemberAllowed('analytics.read')
  @ApiResponse({ status: 200 })
  read(@CurrentUser() user: CurrentUserData, @Query('days') days?: string) {
    return this.stats.read(
      user.profileId,
      days ? Number.parseInt(days, 10) : undefined,
    );
  }
}
