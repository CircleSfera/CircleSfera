import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN_STEP_UP_KEY,
  AdminGuard,
  RequireAdminStepUp,
  RequireStaffPermissions,
  STAFF_PERMISSIONS_KEY,
} from './admin.guard.js';

describe('AdminGuard (Admin Panel RBAC)', () => {
  let guard: AdminGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new AdminGuard(reflector);
  });

  const ctx = (user: unknown, required?: string[]) => {
    const handler = required
      ? RequireStaffPermissions(...(required as any))
      : () => undefined;
    // Apply metadata via Reflector pattern used by Nest
    if (required) {
      Reflect.defineMetadata(STAFF_PERMISSIONS_KEY, required, handler);
    }
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => handler,
      getClass: () => class {},
    } as any;
  };

  it('denies missing admin session', () => {
    expect(() => guard.canActivate(ctx(undefined))).toThrow(/Staff access/);
  });

  it('denies when no permissions declared on route', () => {
    expect(() =>
      guard.canActivate(
        ctx({
          adminId: 'a1',
          permissions: ['users.read'],
          roles: ['SUPPORT_ADMIN'],
        }),
      ),
    ).toThrow(/Explicit permissions/);
  });

  it('allows SUPER_ADMIN for any required permission', () => {
    expect(
      guard.canActivate(
        ctx(
          {
            adminId: 'a1',
            permissions: ['admins.manage', 'users.read'],
            roles: ['SUPER_ADMIN'],
          },
          ['system'],
        ),
      ),
    ).toBe(true);
  });

  it('allows when permission present', () => {
    expect(
      guard.canActivate(
        ctx(
          {
            adminId: 'a1',
            permissions: ['users.read', 'support'],
            roles: ['SUPPORT_ADMIN'],
          },
          ['users.read'],
        ),
      ),
    ).toBe(true);
  });

  it('denies when permission missing', () => {
    expect(() =>
      guard.canActivate(
        ctx(
          {
            adminId: 'a1',
            permissions: ['support'],
            roles: ['SUPPORT_ADMIN'],
          },
          ['payments'],
        ),
      ),
    ).toThrow(/Access denied/);
  });

  it('denies when step-up is required but admin has not completed step-up', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(STAFF_PERMISSIONS_KEY, ['system'], handler);
    Reflect.defineMetadata('admin_step_up', true, handler);

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            adminId: 'a1',
            permissions: ['system'],
            roles: ['SUPER_ADMIN'],
            stepUpVerified: false,
          },
        }),
      }),
      getHandler: () => handler,
      getClass: () => class {},
    } as any;

    expect(() => guard.canActivate(context)).toThrow(/ADMIN_STEP_UP_REQUIRED/);
  });

  it('allows when step-up is required and admin has completed step-up', () => {
    const handler = () => undefined;
    Reflect.defineMetadata(STAFF_PERMISSIONS_KEY, ['system'], handler);
    Reflect.defineMetadata('admin_step_up', true, handler);

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            adminId: 'a1',
            permissions: ['system'],
            roles: ['SUPER_ADMIN'],
            stepUpVerified: true,
          },
        }),
      }),
      getHandler: () => handler,
      getClass: () => class {},
    } as any;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('RequireAdminStepUp decorator defines metadata correctly', () => {
    class Target {
      @RequireAdminStepUp()
      criticalAction() {}
    }
    const meta = Reflect.getMetadata(
      ADMIN_STEP_UP_KEY,
      Target.prototype.criticalAction,
    );
    expect(meta).toBe(true);
  });
});
