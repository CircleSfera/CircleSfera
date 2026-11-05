import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import type { CurrentAdminData } from '../auth/decorators/current-admin.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Every page of the review area anyone opens is written down: who, which page
// with which filters, when and from where. So the owner can see what an
// external reviewer looked at. A failure to write it never blocks the page.
@Injectable()
export class ReviewViewLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ReviewViewLogInterceptor.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: CurrentAdminData }>();
    const adminId = request.user?.adminId;
    if (adminId) {
      await this.prisma.adminAuditLog
        .create({
          data: {
            adminId,
            action: 'REVIEW_VIEWED',
            targetType: 'review',
            targetId: request.path.split('/').pop() || 'review',
            details: request.originalUrl.slice(0, 500),
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          },
        })
        .catch((error: unknown) =>
          this.logger.warn(
            `A review page view could not be written down: ${error instanceof Error ? error.message : 'unknown error'}`,
          ),
        );
    }
    return next.handle();
  }
}
