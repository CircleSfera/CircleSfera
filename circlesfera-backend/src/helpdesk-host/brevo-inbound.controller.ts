import { createHash, timingSafeEqual } from 'node:crypto';
import {
  Body,
  type CanActivate,
  Controller,
  type ExecutionContext,
  HttpCode,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { HelpdeskDataPort } from '../helpdesk/helpdesk-data.port.js';
import type { InboundEmail } from '../helpdesk/helpdesk-inbound.js';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Lets in only the mail provider: the call must carry the secret token.
 * While email in is not set up the route does not exist.
 */
@Injectable()
export class InboundTokenGuard implements CanActivate {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(HelpdeskDataPort) private readonly helpdesk: HelpdeskDataPort,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const token = (
      this.config.get<string>('HELPDESK_INBOUND_TOKEN') ?? ''
    ).trim();
    if (!token || !this.helpdesk.emailInEnabled()) {
      throw new NotFoundException();
    }
    const sent = String(
      context.switchToHttp().getRequest().headers?.authorization ?? '',
    );
    const given = /^Bearer\s+(.+)$/i.exec(sent.trim())?.[1] ?? '';
    // Digests have the same length whatever was sent, so the comparison
    // takes the same time for any wrong token.
    if (!timingSafeEqual(digest(given), digest(token))) {
      throw new UnauthorizedException();
    }
    return true;
  }
}

const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';
const address = (mailbox: unknown): string =>
  text((mailbox as { Address?: unknown } | null)?.Address);

/** One email as Brevo's inbound parsing posts it, in the Help Desk's words. */
export function fromBrevo(item: Record<string, unknown>): InboundEmail | null {
  const from = address(item.From);
  if (!from) return null;
  const list = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : [];
  const spam = (item.Spam as { Score?: unknown } | undefined)?.Score;
  return {
    messageId: text(item.MessageId) || null,
    from,
    // The envelope recipients first: they are where the mail really went.
    to: [
      ...list(item.Recipients).map(text),
      ...list(item.To).map(address),
      ...list(item.Cc).map(address),
    ].filter(Boolean),
    subject: text(item.Subject),
    // Brevo's own cut of quoted replies and signature, when it made one.
    text: text(item.ExtractedMarkdownMessage) || text(item.RawTextBody),
    spamScore:
      typeof spam === 'number'
        ? spam
        : typeof item.SpamScore === 'number'
          ? item.SpamScore
          : null,
    attachmentCount: list(item.Attachments).length,
    headers:
      item.Headers && typeof item.Headers === 'object'
        ? (item.Headers as Record<string, unknown>)
        : {},
  };
}

// Where the mail provider posts the email it received for the reply
// addresses. No session: the provider sends no cookies, so the route is
// outside the cookie-based write protection (main.ts) and asks for its own
// token. Nothing a sender wrote is logged.
@Controller('helpdesk/inbound')
export class BrevoInboundController {
  private readonly logger = new Logger('HelpdeskInbound');

  constructor(
    @Inject(HelpdeskDataPort) private readonly helpdesk: HelpdeskDataPort,
  ) {}

  @Post('email')
  @HttpCode(HttpStatus.OK)
  @UseGuards(InboundTokenGuard)
  @Throttle({ medium: { limit: 60, ttl: 60000 } })
  async receive(@Body() body: unknown): Promise<{ received: number }> {
    const items = (body as { items?: unknown } | null)?.items;
    let received = 0;
    for (const item of Array.isArray(items) ? items.slice(0, 50) : []) {
      const email =
        item && typeof item === 'object'
          ? fromBrevo(item as Record<string, unknown>)
          : null;
      if (!email) continue;
      const { id, kept } = await this.helpdesk.receiveEmail(email);
      this.logger.log(`Email ${id} ${kept ? 'kept' : 'already kept'}`);
      received += 1;
    }
    return { received };
  }
}
