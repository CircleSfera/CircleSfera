import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUsersService } from './admin-users.service.js';

// The staff user list: which accounts each filter asks the database for.
describe('AdminUsersService: user list filters', () => {
  const prisma = {
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };
  let service: AdminUsersService;

  beforeEach(() => {
    vi.clearAllMocks();
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

  it('lists plan holders without verified identity: a plan in force and no identity', async () => {
    await service.getUsers(
      1,
      10,
      undefined,
      undefined,
      undefined,
      undefined,
      true,
    );

    const { where } = prisma.user.findMany.mock.calls[0][0];
    expect(where.identityVerifiedAt).toBeNull();
    expect(where.platformSubscriptions).toEqual({
      some: { status: { in: ['ACTIVE', 'TRIALING'] } },
    });
    // The count shown to staff uses the same filter as the list.
    expect(prisma.user.count).toHaveBeenCalledWith({ where });
  });

  it('does not filter by plan or identity unless asked', async () => {
    await service.getUsers(1, 10);

    const { where } = prisma.user.findMany.mock.calls[0][0];
    expect(where).not.toHaveProperty('identityVerifiedAt');
    expect(where).not.toHaveProperty('platformSubscriptions');
  });
});
