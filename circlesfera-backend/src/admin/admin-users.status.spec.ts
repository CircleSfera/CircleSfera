import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUsersService } from './admin-users.service.js';

// The state of an account in the staff user list: the "banned" filter keeps
// the accounts off by a sanction, not the ones being deleted, and each row
// says whether its account is being deleted.
describe('AdminUsersService: account state in the list', () => {
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

  it('the banned filter leaves out accounts being deleted', async () => {
    await service.getUsers(1, 10, undefined, 'banned');

    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      isActive: false,
      deletedAt: null,
    });
  });

  it('each row says when its account started being deleted', async () => {
    const deletedAt = new Date('2026-10-18T21:00:00.000Z');
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'u1',
        email: 'a@example.com',
        isActive: false,
        isRootBanned: false,
        deletedAt,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        role: 'USER',
        isTestAccount: false,
        identityVerifiedAt: null,
        stripeIdentitySessionId: null,
        profiles: [],
        linkedAdminIdentities: [],
      },
    ]);
    prisma.user.count.mockResolvedValue(1);

    const result = await service.getUsers(1, 10);

    expect(result.data[0]).toMatchObject({
      isActive: false,
      isRootBanned: false,
      deletedAt,
    });
  });
});
