import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AdminGuard,
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
});
