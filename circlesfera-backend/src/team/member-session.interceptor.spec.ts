import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { MemberAllowed } from './member-allowed.decorator.js';
import { MemberSessionInterceptor } from './member-session.interceptor.js';

class Routes {
  open() {}
  @MemberAllowed('session')
  session() {}
  @MemberAllowed('browse')
  browse() {}
  @MemberAllowed('profile.edit')
  editProfile() {}
  @MemberAllowed('content.manage')
  publish() {}
}

const interceptor = new MemberSessionInterceptor(new Reflector());
const next: CallHandler = { handle: vi.fn(() => of('done')) };

const contextFor = (
  handler: keyof Routes,
  user: Record<string, unknown> | undefined,
  type = 'http',
) =>
  ({
    getType: () => type,
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const passes = (handler: keyof Routes, user?: Record<string, unknown>) => {
  try {
    interceptor.intercept(contextFor(handler, user), next);
    return true;
  } catch (err) {
    expect(err).toMatchObject({ errorCode: 'TEAM_MEMBER_NOT_ALLOWED' });
    return false;
  }
};

describe('MemberSessionInterceptor', () => {
  it('leaves sessions of the person on their own Profiles, and anonymous requests, alone', () => {
    expect(passes('open', { userId: 'u-1' })).toBe(true);
    expect(passes('open', undefined)).toBe(true);
  });

  it('closes every unmarked route to a team member', () => {
    expect(passes('open', { memberRole: 'ADMINISTRATOR' })).toBe(false);
    expect(passes('open', { memberRole: 'EDITOR' })).toBe(false);
  });

  it('opens session and browse routes to every role', () => {
    for (const role of ['ADMINISTRATOR', 'EDITOR']) {
      expect(passes('session', { memberRole: role })).toBe(true);
      expect(passes('browse', { memberRole: role })).toBe(true);
    }
  });

  it('opens an action only to the roles that allow it', () => {
    expect(passes('editProfile', { memberRole: 'ADMINISTRATOR' })).toBe(true);
    expect(passes('editProfile', { memberRole: 'EDITOR' })).toBe(false);
    expect(passes('publish', { memberRole: 'EDITOR' })).toBe(true);
  });

  it('does not apply outside HTTP', () => {
    expect(() =>
      interceptor.intercept(
        contextFor('open', { memberRole: 'EDITOR' }, 'ws'),
        next,
      ),
    ).not.toThrow();
  });
});
