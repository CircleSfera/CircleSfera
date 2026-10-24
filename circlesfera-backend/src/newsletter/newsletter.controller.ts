import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { NewsletterUnsubscribe } from '../email/newsletter-unsubscribe.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Leaves the newsletter from the link in one of them, without signing in.
// The page of the link posts the token in the body; a mail client's one-click
// unsubscribe (RFC 8058) posts to the List-Unsubscribe address, token in the
// query, with no cookies or CSRF token, so the route is excluded from CSRF in
// main.ts. The signed token is what authorises it, and it can only switch
// the newsletter of its own account off.
@Controller('newsletter')
export class NewsletterController {
  constructor(
    @Inject(NewsletterUnsubscribe)
    private readonly tokens: NewsletterUnsubscribe,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Post('unsubscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({
    short: { limit: 5, ttl: 1000 },
    medium: { limit: 30, ttl: 60000 },
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  async unsubscribe(
    @Query('token') queryToken: unknown,
    @Body() body: unknown,
  ): Promise<void> {
    const bodyToken =
      body && typeof body === 'object'
        ? (body as Record<string, unknown>).token
        : undefined;
    const userId = this.tokens.verify(bodyToken ?? queryToken);
    if (!userId) throw new BadRequestException('Invalid unsubscribe link');
    // An account deleted since the newsletter was sent has nothing to switch.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) return;
    await this.prisma.userSettings.upsert({
      where: { userId },
      update: { newsletter: false },
      create: { userId, newsletter: false },
    });
  }
}
