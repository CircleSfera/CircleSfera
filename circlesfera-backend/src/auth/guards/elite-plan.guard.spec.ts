import { ErrorCode } from '@circlesfera/shared';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { ElitePlanGuard } from './elite-plan.guard.js';

function contextFor(user?: { profileId?: string }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardWith(verificationLevel: string | null) {
  const prisma = {
    profile: {
      findUnique: vi
        .fn()
        .mockResolvedValue(verificationLevel ? { verificationLevel } : null),
    },
  } as unknown as PrismaService;
  return new ElitePlanGuard(prisma);
}

describe('ElitePlanGuard', () => {
  it.each(['ELITE', 'BUSINESS'])(
    'allows a Profile on the %s plan',
    async (level) => {
      await expect(
        guardWith(level).canActivate(contextFor({ profileId: 'p-1' })),
      ).resolves.toBe(true);
    },
  );

  it.each(['BASIC', 'VERIFIED'])(
    'refuses a Profile on the %s level, naming the plan as the reason',
    async (level) => {
      await expect(
        guardWith(level).canActivate(contextFor({ profileId: 'p-1' })),
      ).rejects.toMatchObject({
        status: 403,
        response: expect.objectContaining({
          errorCode: ErrorCode.PLAN_REQUIRED,
        }),
      });
    },
  );

  it('refuses an unknown Profile and a missing session', async () => {
    await expect(
      guardWith(null).canActivate(contextFor({ profileId: 'p-1' })),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      guardWith('ELITE').canActivate(contextFor()),
    ).rejects.toMatchObject({ status: 403 });
  });
});
