import * as crypto from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SlackGuard } from './slack.guard.js';

describe('SlackGuard', () => {
  let guard: SlackGuard;
  let mockConfigService: {
    get: ReturnType<typeof vi.fn>;
  };

  const createMockContext = (
    headers: Record<string, string>,
    rawBody?: Buffer,
  ): ExecutionContext => {
    const mockRequest = {
      headers,
      rawBody,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'SLACK_SIGNING_SECRET') return 'secret123';
        return null;
      }),
    };
    guard = new SlackGuard(mockConfigService as unknown as ConfigService);
  });

  it('throws UnauthorizedException if headers are missing', () => {
    const context = createMockContext({});
    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException('Missing Slack signature headers'),
    );
  });

  it('throws UnauthorizedException if timestamp is older than 5 minutes', () => {
    const expiredTimestamp = (Math.floor(Date.now() / 1000) - 301).toString();
    const context = createMockContext({
      'x-slack-signature': 'v0=abc',
      'x-slack-request-timestamp': expiredTimestamp,
    });
    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException('Slack request timestamp expired'),
    );
  });

  it('throws UnauthorizedException if signing secret is not configured', () => {
    mockConfigService.get.mockReturnValue(null);
    const validTimestamp = Math.floor(Date.now() / 1000).toString();
    const context = createMockContext({
      'x-slack-signature': 'v0=abc',
      'x-slack-request-timestamp': validTimestamp,
    });
    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException('Slack signing secret not configured'),
    );
  });

  it('returns false if rawBody is not present', () => {
    const validTimestamp = Math.floor(Date.now() / 1000).toString();
    const context = createMockContext(
      {
        'x-slack-signature': 'v0=abc',
        'x-slack-request-timestamp': validTimestamp,
      },
      undefined,
    );
    expect(guard.canActivate(context)).toBe(false);
  });

  it('throws UnauthorizedException if signature does not match', () => {
    const validTimestamp = Math.floor(Date.now() / 1000).toString();
    const body = Buffer.from('payload=test');
    const wrongSignature =
      'v0=' +
      crypto
        .createHmac('sha256', 'wrongsecret')
        .update(`v0:${validTimestamp}:${body.toString()}`)
        .digest('hex');

    const context = createMockContext(
      {
        'x-slack-signature': wrongSignature,
        'x-slack-request-timestamp': validTimestamp,
      },
      body,
    );
    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException('Invalid Slack signature'),
    );
  });

  it('throws UnauthorizedException if signature length is mismatched causing timingSafeEqual to throw', () => {
    const validTimestamp = Math.floor(Date.now() / 1000).toString();
    const body = Buffer.from('payload=test');

    const context = createMockContext(
      {
        'x-slack-signature': 'v0=short',
        'x-slack-request-timestamp': validTimestamp,
      },
      body,
    );
    expect(() => guard.canActivate(context)).toThrow(
      new UnauthorizedException('Invalid Slack signature'),
    );
  });

  it('returns true when signature matches accurately', () => {
    const validTimestamp = Math.floor(Date.now() / 1000).toString();
    const body = Buffer.from('payload=test');
    const expectedSig =
      'v0=' +
      crypto
        .createHmac('sha256', 'secret123')
        .update(`v0:${validTimestamp}:${body.toString()}`)
        .digest('hex');

    const context = createMockContext(
      {
        'x-slack-signature': expectedSig,
        'x-slack-request-timestamp': validTimestamp,
      },
      body,
    );
    expect(guard.canActivate(context)).toBe(true);
  });
});
