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

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

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
    const isCsrfError =
      (exception as CsrfError).code === 'EBADCSRFTOKEN' ||
      (exception as CsrfError).message === 'invalid csrf token';

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
      this.logger.error(
        `Unhandled exception [${httpAdapter.getRequestMethod(request)}] ${httpAdapter.getRequestUrl(request)}: ${errorStack}`,
      );

      // Report internal server errors to Sentry
      Sentry.captureException(exception);
    }

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
  }
}
