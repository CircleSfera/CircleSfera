import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Optional,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as Sentry from '@sentry/nestjs';
import { CorrelationContext } from '../correlation/correlation.context.js';
import { redactSensitiveText } from '../observability/redaction.util.js';
import { sanitizeUrl } from '../utils/url-sanitizer.util.js';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    @Optional()
    @Inject(EventEmitter2)
    private readonly eventEmitter?: EventEmitter2,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    // In some edge cases or tests, httpAdapterHost might not be fully ready
    if (!this.httpAdapterHost?.httpAdapter) {
      this.logger.error(
        'HttpAdapterHost or HttpAdapter not found. Fallback logging:',
        exception,
      );
      return;
    }

    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Record<string, unknown>>();
    const rawPath = httpAdapter.getRequestUrl(request) as string;
    const path = sanitizeUrl(rawPath);
    const method = httpAdapter.getRequestMethod(request) as string;

    // Csrf-csrf throws ForbiddenError (not HttpException). Treat as client 403
    // Never escalate to Sentry/Slack (telemetry retries make this noisy).
    if (this.isCsrfError(exception)) {
      this.logger.warn(`Invalid CSRF token [${method}] ${path}`);
      httpAdapter.reply(
        ctx.getResponse(),
        {
          statusCode: HttpStatus.FORBIDDEN,
          timestamp: new Date().toISOString(),
          path,
          message: 'Invalid CSRF Token',
          details: null,
        },
        HttpStatus.FORBIDDEN,
      );
      return;
    }

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const correlationId =
      CorrelationContext.getId() ||
      (request?.headers as Record<string, unknown> | undefined)?.[
        'x-correlation-id'
      ] ||
      (request?.headers as Record<string, unknown> | undefined)?.[
        'x-request-id'
      ] ||
      undefined;

    const responseBody: Record<string, unknown> = {
      statusCode: httpStatus,
      timestamp: new Date().toISOString(),
      path,
      ...(correlationId && { correlationId }),
      message: 'Internal server error',
      errorCode: 'INTERNAL_SERVER_ERROR',
      details: null as unknown,
    };

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'object' && response !== null) {
        const responseObj = response as Record<string, unknown>;
        responseBody.message =
          (responseObj.message as string) || exception.message;
        responseBody.errorCode =
          (responseObj.errorCode as string) || 'HTTP_EXCEPTION';
        responseBody.details =
          responseObj.details || responseObj.errors || null;
      } else {
        responseBody.message = String(response);
        responseBody.errorCode = 'HTTP_EXCEPTION';
      }
    } else {
      const errorStack =
        exception instanceof Error
          ? exception.stack || exception.message
          : typeof exception === 'string'
            ? exception
            : JSON.stringify(exception);

      const sanitizedErrorStack = redactSensitiveText(errorStack);

      responseBody.details =
        process.env.NODE_ENV === 'production' ? null : sanitizedErrorStack;

      this.logger.error(
        `Unhandled exception [${method}] ${path}: ${sanitizedErrorStack}`,
      );

      // Report true unexpected errors only (not mapped client 4xx)
      if (httpStatus >= 500) {
        Sentry.captureException(exception);

        this.eventEmitter?.emit('system.incident', {
          message: redactSensitiveText(
            exception instanceof Error ? exception.message : 'Unknown Error',
          ),
          stack: sanitizedErrorStack,
          path,
          method,
          statusCode: httpStatus,
          timestamp: new Date().toISOString(),
          ...(correlationId && { correlationId }),
        });
      }
    }

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
  }

  private isCsrfError(exception: unknown): boolean {
    if (!exception || typeof exception !== 'object') return false;
    const err = exception as { code?: string; message?: string; name?: string };
    return (
      err.code === 'EBADCSRFTOKEN' ||
      err.message?.toLowerCase().includes('csrf') === true ||
      err.name?.toLowerCase().includes('csrf') === true
    );
  }
}
