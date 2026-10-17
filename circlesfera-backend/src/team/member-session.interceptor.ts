import { ErrorCode } from '@circlesfera/shared';
import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { AppException } from '../common/errors/app.exception.js';
import {
  MEMBER_ALLOWED,
  type MemberAccess,
} from './member-allowed.decorator.js';
import { roleAllows } from './profile-actions.js';

// A session acting as a Profile the person works on as a team member is
// refused everywhere except the routes marked for it (ADR-0028). It runs
// after the guards, once the session is known; a route nobody marked stays
// closed to members.
@Injectable()
export class MemberSessionInterceptor implements NestInterceptor {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const user = context
      .switchToHttp()
      .getRequest<{ user?: CurrentUserData }>().user;
    if (!user?.memberRole) return next.handle();

    const access = this.reflector.getAllAndOverride<MemberAccess | undefined>(
      MEMBER_ALLOWED,
      [context.getHandler(), context.getClass()],
    );
    const open =
      access === 'session' ||
      access === 'browse' ||
      (!!access && roleAllows(user.memberRole, access));
    if (!open) {
      throw AppException.Forbidden(
        ErrorCode.TEAM_MEMBER_NOT_ALLOWED,
        'Not open to team members of this profile',
      );
    }
    return next.handle();
  }
}
