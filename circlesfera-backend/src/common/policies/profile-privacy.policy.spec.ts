import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setProfilePrivacy } from './profile-privacy.policy.js';

describe('setProfilePrivacy', () => {
  const prisma = {
    profile: { findUnique: vi.fn(), update: vi.fn() },
    follow: { updateMany: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.profile.update.mockResolvedValue({});
    prisma.follow.updateMany.mockResolvedValue({ count: 3 });
  });

  it('writes the choice on that Profile alone', async () => {
    prisma.profile.findUnique.mockResolvedValue({ privacyLevel: 'PUBLIC' });

    const result = await setProfilePrivacy(prisma as never, 'p-1', 'PRIVATE');

    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { privacyLevel: 'PRIVATE' },
    });
    // Becoming private accepts nobody.
    expect(prisma.follow.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ acceptedRequests: 0 });
  });

  it('accepts the follow requests that were waiting when a private Profile becomes public', async () => {
    prisma.profile.findUnique.mockResolvedValue({ privacyLevel: 'PRIVATE' });

    const result = await setProfilePrivacy(prisma as never, 'p-1', 'PUBLIC');

    expect(prisma.follow.updateMany).toHaveBeenCalledWith({
      where: { followingId: 'p-1', status: 'PENDING' },
      data: { status: 'ACCEPTED' },
    });
    expect(result).toEqual({ acceptedRequests: 3 });
  });

  it.each([
    ['a public Profile saved as public again', 'PUBLIC', 'PUBLIC'],
    ['a private Profile saved as private again', 'PRIVATE', 'PRIVATE'],
    ['a Profile for followers that becomes public', 'FOLLOWERS', 'PUBLIC'],
  ] as const)('accepts nothing for %s', async (_what, before, after) => {
    prisma.profile.findUnique.mockResolvedValue({ privacyLevel: before });

    await setProfilePrivacy(prisma as never, 'p-1', after);

    expect(prisma.follow.updateMany).not.toHaveBeenCalled();
  });
});
