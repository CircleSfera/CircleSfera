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

    let httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Handle CSRF ForbiddenError (which might not be an HttpException)
    // csrf-csrf throws ForbiddenError with code 'EBADCSRFTOKEN' or message 'invalid csrf token'
    interface CsrfError extends Error {
      code?: string;
    }
    const errObj = exception as CsrfError;
    const isCsrfError =
      errObj?.code === 'EBADCSRFTOKEN' ||
      errObj?.message?.toLowerCase().includes('csrf') ||
      errObj?.name?.toLowerCase().includes('csrf');

    if (
      httpStatus === (HttpStatus.INTERNAL_SERVER_ERROR as number) &&
      isCsrfError
    ) {
      httpStatus = HttpStatus.FORBIDDEN;
    }

    const request = ctx.getRequest<Record<string, unknown>>();
    const responseBody = {
      statusCode: httpStatus,
      timestamp: new Date().toISOString(),
      path: httpAdapter.getRequestUrl(request) as string,
      message:
        httpStatus === (HttpStatus.FORBIDDEN as number) && isCsrfError
          ? 'Invalid CSRF Token'
          : 'Internal server error',
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
        `Unhandled exception [${httpAdapter.getRequestMethod(request)}] ${httpAdapter.getRequestUrl(request)}: ${errorStack}`,
      );

      // Report internal server errors to Sentry
      Sentry.captureException(exception);

      // Also notify Slack for 500 errors
      if (this.slackService) {
        this.slackService
          .sendProductionAlert({
            message:
              exception instanceof Error ? exception.message : 'Unknown Error',
            stack: errorStack,
            path: httpAdapter.getRequestUrl(request) as string,
          })
          .catch((e) => this.logger.error('Failed to send slack alert', e));
      }
    }

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
  }
}
