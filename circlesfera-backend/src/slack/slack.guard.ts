import * as crypto from 'node:crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class SlackGuard implements CanActivate {
  private readonly logger = new Logger(SlackGuard.name);

  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const slackSignature = req.headers['x-slack-signature'] as string;
    const slackTimestamp = req.headers['x-slack-request-timestamp'] as string;

    if (!slackSignature || !slackTimestamp) {
      this.logger.warn('Missing Slack signature headers');
      throw new UnauthorizedException('Missing Slack signature headers');
    }

    // Verify timestamp isn't older than 5 minutes to prevent replay attacks
    const time = Math.floor(Date.now() / 1000);
    if (Math.abs(time - parseInt(slackTimestamp, 10)) > 300) {
      this.logger.warn('Slack request timestamp expired');
      throw new UnauthorizedException('Slack request timestamp expired');
    }

    const signingSecret = this.configService.get<string>(
      'SLACK_SIGNING_SECRET',
    );
    if (!signingSecret) {
      this.logger.error('SLACK_SIGNING_SECRET not configured');
      throw new UnauthorizedException('Slack signing secret not configured');
    }

    // rawBody is attached by NestFactory.create({ rawBody: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawBody = (req as any).rawBody as Buffer;
    if (!rawBody) {
      this.logger.error('Raw body not available for signature verification');
      throw new UnauthorizedException(
        'Raw body is required for Slack signature verification',
      );
    }

    const sigBasestring = `v0:${slackTimestamp}:${rawBody.toString('utf8')}`;
    const mySignature =
      'v0=' +
      crypto
        .createHmac('sha256', signingSecret)
        .update(sigBasestring, 'utf8')
        .digest('hex');

    try {
      if (
        !crypto.timingSafeEqual(
          Buffer.from(mySignature, 'utf8'),
          Buffer.from(slackSignature, 'utf8'),
        )
      ) {
        this.logger.warn('Invalid Slack signature');
        throw new UnauthorizedException('Invalid Slack signature');
      }
    } catch (_e) {
      this.logger.warn('Invalid Slack signature format');
      throw new UnauthorizedException('Invalid Slack signature');
    }

    return true;
  }
}
