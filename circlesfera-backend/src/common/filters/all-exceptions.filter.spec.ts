import { type ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

describe('AllExceptionsFilter', () => {
  const reply = vi.fn();
  const getRequestUrl = vi.fn(() => '/api/v1/analytics/events/batch');
  const getRequestMethod = vi.fn(() => 'POST');
  const eventEmitter = {
    emit: vi.fn(),
  };

  let filter: AllExceptionsFilter;
  let host: ArgumentsHost;

  beforeEach(() => {
    vi.clearAllMocks();
    const httpAdapterHost = {
      httpAdapter: { reply, getRequestUrl, getRequestMethod },
    } as unknown as HttpAdapterHost;
    filter = new AllExceptionsFilter(httpAdapterHost, eventEmitter as never);
    host = {
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => ({}),
      }),
    } as ArgumentsHost;
  });

  it('maps CSRF ForbiddenError to 403 without incident event noise', () => {
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
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('emits system.incident event for unexpected non-HttpException 500s', () => {
    filter.catch(new Error('boom'), host);

    expect(reply).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR }),
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'system.incident',
      expect.objectContaining({
        message: 'boom',
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        path: '/api/v1/analytics/events/batch',
        method: 'POST',
      }),
    );
  });

  it('does not emit system.incident event for HttpException 4xx', () => {
    filter.catch(new HttpException('nope', HttpStatus.BAD_REQUEST), host);

    expect(eventEmitter.emit).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ statusCode: HttpStatus.BAD_REQUEST }),
      HttpStatus.BAD_REQUEST,
    );
  });
});
