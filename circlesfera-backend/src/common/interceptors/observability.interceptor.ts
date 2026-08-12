import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');
  private readonly SLOW_THRESHOLD_MS = 500; // 500ms threshold for slow requests

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const { method, originalUrl } = req;

    // Do not log noisy health check endpoints
    if (originalUrl.includes('/health')) {
      return next.handle();
    }

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = res.statusCode;

          if (duration > this.SLOW_THRESHOLD_MS) {
            this.logger.warn(
              `[SLOW REQUEST] ${method} ${originalUrl} ${statusCode} - ${duration}ms`,
            );
          }
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error?.status || error?.statusCode || 500;

          this.logger.error(
            `[ERROR] ${method} ${originalUrl} ${statusCode} - ${duration}ms - ${error.message}`,
            error.stack,
          );
        },
      }),
    );
  }
}
