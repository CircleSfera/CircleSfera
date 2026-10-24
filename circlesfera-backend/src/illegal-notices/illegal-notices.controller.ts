import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { requestAbuseMeta } from '../common/abuse/device-signal.service.js';
import { TurnstileService } from '../common/abuse/turnstile.service.js';
import { CreateIllegalNoticeDto } from './dto/create-illegal-notice.dto.js';
import { IllegalNoticesService } from './illegal-notices.service.js';

// Anyone, with or without an account, can notify illegal content on
// CircleSfera (Digital Services Act Art. 16). The bot check and throttling
// stand in for the session.
@Controller('illegal-content-notices')
export class IllegalNoticesController {
  constructor(
    @Inject(IllegalNoticesService)
    private readonly notices: IllegalNoticesService,
    @Inject(TurnstileService) private readonly turnstile: TurnstileService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({
    short: { limit: 2, ttl: 1000 },
    medium: { limit: 10, ttl: 3_600_000 },
  })
  @ApiResponse({ status: HttpStatus.CREATED })
  async create(@Body() dto: CreateIllegalNoticeDto, @Req() req: Request) {
    const meta = requestAbuseMeta(
      req as unknown as Parameters<typeof requestAbuseMeta>[0],
    );
    await this.turnstile.assertValid(
      dto.captchaToken,
      meta.ip,
      meta.turnstileBypassToken,
    );
    if (!this.notices.isOwnAddress(dto.contentUrl)) {
      throw new BadRequestException(
        'The address must be of content on CircleSfera',
      );
    }
    return this.notices.create(dto);
  }
}
