import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { CreatorAccountGuard } from './creator-account.guard.js';

function contextFor(user?: { profileId?: string }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardWith(accountType: string | null) {
  const prisma = {
    profile: {
      findUnique: vi
        .fn()
        .mockResolvedValue(accountType ? { accountType } : null),
    },
  } as unknown as PrismaService;
  return new CreatorAccountGuard(prisma);
}

describe('CreatorAccountGuard', () => {
  it('allows Creator and Business profiles without any platform plan', async () => {
    for (const type of ['CREATOR', 'BUSINESS']) {
      await expect(
        guardWith(type).canActivate(contextFor({ profileId: 'p-1' })),
      ).resolves.toBe(true);
    }
  });

  it('rejects Personal profiles, unknown profiles and missing sessions', async () => {
    await expect(
      guardWith('PERSONAL').canActivate(contextFor({ profileId: 'p-1' })),
    ).rejects.toThrow(AppException);
    await expect(
      guardWith(null).canActivate(contextFor({ profileId: 'p-1' })),
    ).rejects.toThrow(AppException);
    await expect(
      guardWith('CREATOR').canActivate(contextFor()),
    ).rejects.toThrow(AppException);
  });
});
