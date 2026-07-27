import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import { SlackService } from '../../slack/slack.service.js';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly slackService?: SlackService,
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
    const path = httpAdapter.getRequestUrl(request) as string;
    const method = httpAdapter.getRequestMethod(request) as string;

    // csrf-csrf throws ForbiddenError (not HttpException). Treat as client 403 —
    // never escalate to Sentry/Slack (telemetry retries make this noisy).
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

    const responseBody = {
      statusCode: httpStatus,
      timestamp: new Date().toISOString(),
      path,
      message: 'Internal server error',
      details: null as unknown,
    };

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'object' && response !== null) {
        const responseObj = response as Record<string, unknown>;
        responseBody.message =
          (responseObj.message as string) || exception.message;
        responseBody.details = responseObj.errors || null;
      } else {
        responseBody.message = String(response);
      }
    } else {
      const errorStack =
        exception instanceof Error
          ? exception.stack || exception.message
          : typeof exception === 'string'
            ? exception
            : JSON.stringify(exception);

      responseBody.details = errorStack;

      this.logger.error(
        `Unhandled exception [${method}] ${path}: ${errorStack}`,
      );

      // Report true unexpected errors only (not mapped client 4xx)
      if (httpStatus >= 500) {
        Sentry.captureException(exception);

        if (this.slackService) {
          this.slackService
            .sendProductionAlert({
              message:
                exception instanceof Error
                  ? exception.message
                  : 'Unknown Error',
              stack: errorStack,
              path,
            })
            .catch((e) => this.logger.error('Failed to send slack alert', e));
        }
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
