import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ProfileActivityAction } from '@prisma/client';
import { type Observable, tap } from 'rxjs';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RECORDS_ACTIVITY } from './records-activity.decorator.js';

// Records, after it succeeds, a content action on a Business Profile with
// the person who took it: the Profile stays the public author (ADR-0028).
// A failure to record never undoes or fails the action.
@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActivityInterceptor.name);

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const action = this.reflector.get<ProfileActivityAction | undefined>(
      RECORDS_ACTIVITY,
      context.getHandler(),
    );
    const request = context.switchToHttp().getRequest<{
      user?: CurrentUserData;
      params?: Record<string, string>;
    }>();
    const user = request.user;
    if (!action || !user?.profileId) return next.handle();

    return next.handle().pipe(
      tap((result) => {
        const created = (result as { id?: unknown } | null | undefined)?.id;
        const targetId =
          typeof created === 'string' ? created : request.params?.id;
        void this.record(user, action, targetId).catch((err) =>
          this.logger.error('Failed to record a team activity', err),
        );
      }),
    );
  }

  private async record(
    user: CurrentUserData,
    action: ProfileActivityAction,
    targetId: string | undefined,
  ) {
    // Kept for Business Profiles, where a team may work; a member session
    // is always on one.
    if (!user.memberRole) {
      const profile = await this.prisma.profile.findUnique({
        where: { id: user.profileId },
        select: { accountType: true },
      });
      if (profile?.accountType !== 'BUSINESS') return;
    }
    await this.prisma.profileActivity.create({
      data: {
        profileId: user.profileId,
        userId: user.userId,
        action,
        targetId: targetId ?? null,
      },
    });
  }
}
