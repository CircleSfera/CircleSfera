import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUsersService } from './admin-users.service.js';

// The identity check in the staff user list: the filter values the screen
// sends, and the figures of each state.
describe('AdminUsersService: identity check', () => {
  const prisma = {
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };
  let service: AdminUsersService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);
    service = new AdminUsersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  const whereFor = async (kycStatus?: string) => {
    await service.getUsers(1, 10, undefined, undefined, undefined, kycStatus);
    return prisma.user.findMany.mock.calls[0][0].where;
  };

  it('verified: accounts whose identity is verified', async () => {
    expect(await whereFor('verified')).toEqual({
      identityVerifiedAt: { not: null },
    });
  });

  it('pending: the check was started and is not finished', async () => {
    expect(await whereFor('pending')).toEqual({
      identityVerifiedAt: null,
      stripeIdentitySessionId: { not: null },
    });
  });

  it('not started: no check was ever opened', async () => {
    expect(await whereFor('not_started')).toEqual({
      identityVerifiedAt: null,
      stripeIdentitySessionId: null,
    });
  });

  it('no filter: every account', async () => {
    expect(await whereFor()).toEqual({});
  });

  it('counts each state, and the three add up to the total', async () => {
    prisma.user.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(20);

    expect(await service.getKycStats()).toEqual({
      verified: 4,
      pending: 3,
      notStarted: 13,
      total: 20,
    });
  });
});
