import { type ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

describe('AllExceptionsFilter', () => {
  const reply = vi.fn();
  const getRequestUrl = vi.fn(() => '/api/v1/analytics/events/batch');
  const getRequestMethod = vi.fn(() => 'POST');
  const slackService = {
    sendProductionAlert: vi.fn().mockResolvedValue(undefined),
  };

  let filter: AllExceptionsFilter;
  let host: ArgumentsHost;

  beforeEach(() => {
    vi.clearAllMocks();
    const httpAdapterHost = {
      httpAdapter: { reply, getRequestUrl, getRequestMethod },
    } as unknown as HttpAdapterHost;
    filter = new AllExceptionsFilter(httpAdapterHost, slackService as never);
    host = {
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => ({}),
      }),
    } as ArgumentsHost;
  });

  it('maps CSRF ForbiddenError to 403 without Slack/Sentry noise', () => {
    const err = Object.assign(new Error('invalid csrf token'), {
      code: 'EBADCSRFTOKEN',
    });

    filter.catch(err, host);

    expect(reply).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Invalid CSRF Token',
        details: null,
      }),
      HttpStatus.FORBIDDEN,
    );
    expect(slackService.sendProductionAlert).not.toHaveBeenCalled();
  });

  it('still alerts Slack for unexpected non-HttpException 500s', () => {
    filter.catch(new Error('boom'), host);

    expect(reply).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR }),
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(slackService.sendProductionAlert).toHaveBeenCalled();
  });

  it('does not alert Slack for HttpException 4xx', () => {
    filter.catch(new HttpException('nope', HttpStatus.BAD_REQUEST), host);

    expect(slackService.sendProductionAlert).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ statusCode: HttpStatus.BAD_REQUEST }),
      HttpStatus.BAD_REQUEST,
    );
  });
});
