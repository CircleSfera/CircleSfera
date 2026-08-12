import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CurrentAdminData } from '../decorators/current-admin.decorator.js';

/** Permission scopes for Admin Panel staff (loaded from AdminPermission.key). */
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
  | 'content'
  | 'admins.manage';

export const STAFF_PERMISSIONS_KEY = 'staff_permissions';
export const ADMIN_STEP_UP_KEY = 'admin_step_up';

/** Require one of the listed permissions (SUPER_ADMIN / all permissions pass). */
export const RequireStaffPermissions = (...permissions: StaffPermission[]) =>
  SetMetadata(STAFF_PERMISSIONS_KEY, permissions);

/** Require recent step-up re-auth (password or MFA) for critical mutations. */
export const RequireAdminStepUp = () => SetMetadata(ADMIN_STEP_UP_KEY, true);

/**
 * Authorizes Admin Panel operators after AdminJwtAuthGuard.
 * Permissions come from AdminIdentity roles in the DB.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const admin = request.user as CurrentAdminData | undefined;

    if (!admin?.adminId || !Array.isArray(admin.permissions)) {
      throw new ForbiddenException('Staff access required');
    }

    const required =
      this.reflector.getAllAndOverride<StaffPermission[]>(
        STAFF_PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      ) || [];

    if (required.length === 0) {
      throw new ForbiddenException(
        'Explicit permissions required for staff routes',
      );
    }

    const permissionSet = new Set(admin.permissions);
    // SUPER_ADMIN / full grant: presence of admins.manage implies all, or explicit *
    const hasAll =
      permissionSet.has('admins.manage') ||
      admin.roles?.includes('SUPER_ADMIN');

    if (!hasAll) {
      const missing = required.filter((p) => !permissionSet.has(p));
      if (missing.length > 0) {
        throw new ForbiddenException(
          `Access denied for: ${missing.join(', ')}`,
        );
      }
    }

    const needsStepUp = this.reflector.getAllAndOverride<boolean>(
      ADMIN_STEP_UP_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (needsStepUp && !admin.stepUpVerified) {
      throw new UnauthorizedException({
        message: 'ADMIN_STEP_UP_REQUIRED',
        code: 'ADMIN_STEP_UP_REQUIRED',
      });
    }

    return true;
  }
}
