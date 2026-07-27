import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../decorators/current-user.decorator.js';
import {
  AdminGuard,
  STAFF_PERMISSIONS_KEY,
  type StaffPermission,
} from './admin.guard.js';

function mockContext(
  user: CurrentUserData | undefined,
  required: StaffPermission[] | undefined = undefined,
) {
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(required ?? []),
  } as unknown as Reflector;

  const guard = new AdminGuard(reflector);
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as Parameters<AdminGuard['canActivate']>[0];

  return { guard, context, reflector };
}

describe('AdminGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows ADMIN regardless of required permissions', () => {
    const { guard, context } = mockContext(
      { userId: '1', email: 'a@test.com', role: 'ADMIN' },
      ['system'],
    );
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows MODERATOR when required permissions are in the moderator set', () => {
    const { guard, context, reflector } = mockContext(
      { userId: '2', email: 'm@test.com', role: 'MODERATOR' },
      ['reports', 'moderation'],
    );
    expect(guard.canActivate(context)).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      STAFF_PERMISSIONS_KEY,
      expect.any(Array),
    );
  });

  it('denies MODERATOR when route has no explicit permissions (deny-by-default)', () => {
    const { guard, context } = mockContext(
      { userId: '2', email: 'm@test.com', role: 'MODERATOR' },
      [],
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('denies MODERATOR for permissions outside the moderator set', () => {
    const { guard, context } = mockContext(
      { userId: '2', email: 'm@test.com', role: 'MODERATOR' },
      ['payments', 'system'],
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('denies USER', () => {
    const { guard, context } = mockContext({
      userId: '3',
      email: 'u@test.com',
      role: 'USER',
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('denies unauthenticated requests', () => {
    const { guard, context } = mockContext(undefined);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
