import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeController, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { LiveRoomWebhookService } from './live-room-webhook.service.js';

/**
 * The events the live service sends the backend. It calls with no session
 * and no CSRF token: each event is signed with the live service's key, and
 * one not signed is refused. Every event comes from the one live service,
 * so a limit per address would stop all of them on a busy hour and keep
 * nobody out: the signature is what guards the route.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller('live/livekit')
export class LiveRoomWebhookController {
  constructor(private readonly rooms: LiveRoomWebhookService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK })
  async receive(@Req() req: Request): Promise<{ received: true }> {
    const rawBody = (req as { rawBody?: Buffer }).rawBody;
    if (!rawBody) throw new BadRequestException('Missing body');
    await this.rooms.receive(rawBody, req.headers.authorization);
    return { received: true };
  }
}
