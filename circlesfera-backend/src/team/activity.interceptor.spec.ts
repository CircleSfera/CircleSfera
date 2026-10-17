import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityInterceptor } from './activity.interceptor.js';
import { RecordsActivity } from './records-activity.decorator.js';

class Routes {
  @RecordsActivity('POST_PUBLISHED')
  publish() {}
  @RecordsActivity('POST_DELETED')
  remove() {}
  plain() {}
}

describe('ActivityInterceptor', () => {
  const prisma = {
    profile: { findUnique: vi.fn() },
    profileActivity: { create: vi.fn() },
  };
  const interceptor = new ActivityInterceptor(new Reflector(), prisma as never);

  const run = async (
    handler: keyof Routes,
    user: Record<string, unknown> | undefined,
    result: unknown = { id: 'post-new' },
    params: Record<string, string> = {},
    type = 'http',
  ) => {
    const context = {
      getType: () => type,
      getHandler: () => Routes.prototype[handler],
      switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
    } as unknown as ExecutionContext;
    const next: CallHandler = { handle: () => of(result) };
    await lastValueFrom(interceptor.intercept(context, next));
    // The record is written after the answer, without waiting for it.
    await new Promise((r) => setTimeout(r, 0));
  };

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.profileActivity.create.mockResolvedValue({});
  });

  it("records a member's action with the person and what was created", async () => {
    await run('publish', {
      userId: 'u-ana',
      profileId: 'p-shop',
      memberRole: 'EDITOR',
    });
    expect(prisma.profileActivity.create).toHaveBeenCalledWith({
      data: {
        profileId: 'p-shop',
        userId: 'u-ana',
        action: 'POST_PUBLISHED',
        targetId: 'post-new',
      },
    });
    // A member session is always on a Business Profile: no lookup.
    expect(prisma.profile.findUnique).not.toHaveBeenCalled();
  });

  it("records the owner's action on a Business Profile, with the target of the route", async () => {
    prisma.profile.findUnique.mockResolvedValue({ accountType: 'BUSINESS' });
    await run('remove', { userId: 'u-owner', profileId: 'p-shop' }, null, {
      id: 'post-1',
    });
    expect(prisma.profileActivity.create).toHaveBeenCalledWith({
      data: {
        profileId: 'p-shop',
        userId: 'u-owner',
        action: 'POST_DELETED',
        targetId: 'post-1',
      },
    });
  });

  it('records nothing on a Profile that is not Business', async () => {
    prisma.profile.findUnique.mockResolvedValue({ accountType: 'PERSONAL' });
    await run('publish', { userId: 'u-1', profileId: 'p-1' });
    expect(prisma.profileActivity.create).not.toHaveBeenCalled();
  });

  it('records nothing for a route without an action, anonymous, or outside HTTP', async () => {
    await run('plain', {
      userId: 'u-1',
      profileId: 'p-1',
      memberRole: 'EDITOR',
    });
    await run('publish', undefined);
    await run(
      'publish',
      { userId: 'u-1', profileId: 'p-1', memberRole: 'EDITOR' },
      {},
      {},
      'ws',
    );
    expect(prisma.profileActivity.create).not.toHaveBeenCalled();
  });

  it('records nothing when the action fails', async () => {
    const context = {
      getType: () => 'http',
      getHandler: () => Routes.prototype.publish,
      switchToHttp: () => ({
        getRequest: () => ({
          user: { userId: 'u', profileId: 'p', memberRole: 'EDITOR' },
        }),
      }),
    } as unknown as ExecutionContext;
    await expect(
      lastValueFrom(
        interceptor.intercept(context, {
          handle: () => throwError(() => new Error('refused')),
        }),
      ),
    ).rejects.toThrow('refused');
    expect(prisma.profileActivity.create).not.toHaveBeenCalled();
  });

  it('a failure to record never fails the action', async () => {
    prisma.profileActivity.create.mockRejectedValue(new Error('db'));
    await expect(
      run('publish', { userId: 'u', profileId: 'p', memberRole: 'EDITOR' }),
    ).resolves.toBeUndefined();
  });
});
