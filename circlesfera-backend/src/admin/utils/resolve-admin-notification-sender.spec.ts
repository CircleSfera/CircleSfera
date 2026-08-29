import { describe, expect, it, vi } from 'vitest';
import {
  resolveAdminNotificationSenderId,
  resolveSystemModeratorActor,
} from './resolve-admin-notification-sender.js';

describe('resolveAdminNotificationSenderId', () => {
  it('returns the linked user primary profile, not User.id', async () => {
    const prisma = {
      adminIdentity: {
        findUnique: vi.fn().mockResolvedValue({
          linkedUser: { profiles: [{ id: 'profile-1' }] },
        }),
      },
    };

    await expect(
      resolveAdminNotificationSenderId(prisma as never, 'admin-1'),
    ).resolves.toBe('profile-1');
  });

  it('omits sender when the operator has no linked profile', async () => {
    const prisma = {
      adminIdentity: {
        findUnique: vi.fn().mockResolvedValue({
          linkedUser: { profiles: [] },
        }),
      },
    };

    await expect(
      resolveAdminNotificationSenderId(prisma as never, 'admin-1'),
    ).resolves.toBeUndefined();
  });
});

describe('resolveSystemModeratorActor', () => {
  it('returns userId plus primary profileId for an ACTIVE operator', async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'user-1',
          profiles: [{ id: 'profile-1' }],
        }),
      },
    };

    await expect(resolveSystemModeratorActor(prisma as never)).resolves.toEqual(
      {
        userId: 'user-1',
        profileId: 'profile-1',
      },
    );
  });

  it('returns undefined when the operator has no profile', async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'user-1',
          profiles: [],
        }),
      },
    };

    await expect(
      resolveSystemModeratorActor(prisma as never),
    ).resolves.toBeUndefined();
  });
});
