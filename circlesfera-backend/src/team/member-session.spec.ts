import { describe, expect, it, vi } from 'vitest';
import { resolveSessionProfile } from './member-session.js';

const own = [
  { id: 'p-mine', isAccountBanned: false, suspendedUntil: null },
  { id: 'p-mine-2', isAccountBanned: false, suspendedUntil: null },
];

const prismaWith = (membership: unknown) => ({
  profile: { findMany: vi.fn().mockResolvedValue(own) },
  profileMember: { findUnique: vi.fn().mockResolvedValue(membership) },
});

describe('resolveSessionProfile', () => {
  it("keeps a session bound to one of the person's own Profiles, as before", async () => {
    const prisma = prismaWith(null);
    const res = await resolveSessionProfile(prisma as never, 'u-1', 'p-mine-2');
    expect(res).toEqual({ profile: own[1] });
    expect(prisma.profileMember.findUnique).not.toHaveBeenCalled();
  });

  it('acts as a team Profile while the person is an active member, with the role', async () => {
    const shop = { id: 'p-shop', isAccountBanned: false, suspendedUntil: null };
    const prisma = prismaWith({
      status: 'ACTIVE',
      role: 'EDITOR',
      profile: shop,
    });

    const res = await resolveSessionProfile(prisma as never, 'u-1', 'p-shop');

    expect(res).toEqual({ profile: shop, memberRole: 'EDITOR' });
    expect(prisma.profileMember.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { profileId_userId: { profileId: 'p-shop', userId: 'u-1' } },
      }),
    );
  });

  it("falls back to the person's own Profile once the membership is no longer active", async () => {
    for (const status of ['INVITED', 'PAUSED', 'REMOVED', 'DECLINED']) {
      const prisma = prismaWith({
        status,
        role: 'EDITOR',
        profile: { id: 'p-shop' },
      });
      const res = await resolveSessionProfile(prisma as never, 'u-1', 'p-shop');
      expect(res).toEqual({ profile: own[0] });
    }
    const gone = prismaWith(null);
    expect(await resolveSessionProfile(gone as never, 'u-1', 'p-shop')).toEqual(
      { profile: own[0] },
    );
  });

  it('a session bound to nothing takes the oldest usable own Profile', async () => {
    const prisma = prismaWith(null);
    expect(await resolveSessionProfile(prisma as never, 'u-1')).toEqual({
      profile: own[0],
    });
  });
});
