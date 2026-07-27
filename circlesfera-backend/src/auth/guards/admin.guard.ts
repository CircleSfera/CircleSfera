import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CurrentUserData } from '../decorators/current-user.decorator.js';

/** Permission scopes for staff (ADMIN has all; MODERATOR has a subset). */
export type StaffPermission =
  | 'reports'
  | 'appeals'
  | 'moderation'
  | 'users.read'
  | 'users.write'
  | 'users.ban'
  | 'payments'
  | 'system'
  | 'experiments'
  | 'support'
  | 'audit'
  | 'live'
  | 'content';

export const STAFF_PERMISSIONS_KEY = 'staff_permissions';

/** Require one of the listed permissions (ADMIN always passes). */
export const RequireStaffPermissions = (...permissions: StaffPermission[]) =>
  SetMetadata(STAFF_PERMISSIONS_KEY, permissions);

const MODERATOR_PERMISSIONS: ReadonlySet<StaffPermission> = new Set([
  'reports',
  'appeals',
  'moderation',
  'users.read',
  'users.ban',
  'support',
  'audit',
  'live',
  'content',
]);

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as CurrentUserData | undefined;

    if (!user || (user.role !== 'ADMIN' && user.role !== 'MODERATOR')) {
      throw new ForbiddenException('Staff access required');
    }

    if (user.role === 'ADMIN') {
      return true;
    }

    const required =
      this.reflector.getAllAndOverride<StaffPermission[]>(
        STAFF_PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      ) || [];

    // No explicit permissions → ADMIN only (deny-by-default for moderators).
    // Moderator-accessible routes must declare @RequireStaffPermissions(...).
    if (required.length === 0) {
      throw new ForbiddenException(
        'Moderator access denied: route requires ADMIN',
      );
    }

    const missing = required.filter((p) => !MODERATOR_PERMISSIONS.has(p));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Moderator access denied for: ${missing.join(', ')}`,
      );
    }

    return true;
  }
}
