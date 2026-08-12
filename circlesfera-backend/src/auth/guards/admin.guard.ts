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

const SUPPORT_PERMISSIONS: ReadonlySet<StaffPermission> = new Set([
  'support',
  'appeals',
  'users.read',
]);

const FINANCE_PERMISSIONS: ReadonlySet<StaffPermission> = new Set([
  'payments',
  'users.read',
]);

const ROLE_PERMISSIONS: Record<string, ReadonlySet<StaffPermission>> = {
  MODERATOR: MODERATOR_PERMISSIONS,
  SUPPORT: SUPPORT_PERMISSIONS,
  FINANCE: FINANCE_PERMISSIONS,
};

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as CurrentUserData | undefined;

    if (
      !user ||
      !['ADMIN', 'MODERATOR', 'SUPPORT', 'FINANCE'].includes(user.role)
    ) {
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

    if (required.length === 0) {
      throw new ForbiddenException(
        'Explicit permissions required for non-admin',
      );
    }

    const userPermissions = ROLE_PERMISSIONS[user.role];
    if (!userPermissions) {
      throw new ForbiddenException('Invalid staff role');
    }

    const missing = required.filter((p) => !userPermissions.has(p));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `${user.role} access denied for: ${missing.join(', ')}`,
      );
    }

    return true;
  }
}
