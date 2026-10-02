import { ForbiddenException } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { CreatorAccountGuard } from './creator-account.guard.js';

const context = (user?: { profileId?: string }) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as never;

describe('CreatorAccountGuard', () => {
  it('allows CREATOR profiles without consulting PlatformSubscription', async () => {
    const profileFindUnique = vi.fn().mockResolvedValue({
      accountType: AccountType.CREATOR,
    });
    const guard = new CreatorAccountGuard({
      profile: { findUnique: profileFindUnique },
    } as never);

    await expect(
      guard.canActivate(context({ profileId: 'p-creator' })),
    ).resolves.toBe(true);
    expect(profileFindUnique).toHaveBeenCalledWith({
      where: { id: 'p-creator' },
      select: { accountType: true },
    });
  });

  it('allows BUSINESS profiles without consulting PlatformSubscription', async () => {
    const profileFindUnique = vi.fn().mockResolvedValue({
      accountType: AccountType.BUSINESS,
    });
    const guard = new CreatorAccountGuard({
      profile: { findUnique: profileFindUnique },
    } as never);

    await expect(
      guard.canActivate(context({ profileId: 'p-business' })),
    ).resolves.toBe(true);
  });

  it('denies PERSONAL profiles', async () => {
    const profileFindUnique = vi.fn().mockResolvedValue({
      accountType: AccountType.PERSONAL,
    });
    const guard = new CreatorAccountGuard({
      profile: { findUnique: profileFindUnique },
    } as never);

    await expect(
      guard.canActivate(context({ profileId: 'p-personal' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies requests without a profile', async () => {
    const guard = new CreatorAccountGuard({
      profile: { findUnique: vi.fn() },
    } as never);

    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('denies missing profiles', async () => {
    const profileFindUnique = vi.fn().mockResolvedValue(null);
    const guard = new CreatorAccountGuard({
      profile: { findUnique: profileFindUnique },
    } as never);

    await expect(
      guard.canActivate(context({ profileId: 'missing' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
