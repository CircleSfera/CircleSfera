import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { CreatorAccountGuard } from './creator-account.guard.js';

describe('CreatorAccountGuard', () => {
  const prisma = {
    profile: {
      findUnique: vi.fn(),
    },
  };

  const guard = new CreatorAccountGuard(prisma as never);

  const context = (profileId?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user: profileId ? { profileId } : undefined }),
      }),
    }) as unknown as ExecutionContext;

  it.each([AccountType.CREATOR, AccountType.BUSINESS])(
    'allows %s profiles without consulting PlatformSubscription',
    async (accountType) => {
      prisma.profile.findUnique.mockResolvedValue({ accountType });

      await expect(guard.canActivate(context('profile-1'))).resolves.toBe(true);
      expect(prisma.profile.findUnique).toHaveBeenCalledWith({
        where: { id: 'profile-1' },
        select: { accountType: true },
      });
    },
  );

  it('rejects PERSONAL profiles', async () => {
    prisma.profile.findUnique.mockResolvedValue({
      accountType: AccountType.PERSONAL,
    });

    await expect(guard.canActivate(context('profile-1'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects missing profile context', async () => {
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
