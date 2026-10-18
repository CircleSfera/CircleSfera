import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUsersService } from './admin-users.service.js';

// The state of an account in the staff user list: the "banned" filter keeps
// the sanctioned accounts (banned or suspended), and each row says whether
// its account is being deleted.
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

  it('the banned filter lists sanctioned accounts: banned, or suspended for now', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T00:00:00.000Z'));
    await service.getUsers(1, 10, undefined, 'banned');
    vi.useRealTimers();

    // Not merely inactive: an account being deleted or off for another
    // reason is left out.
    expect(prisma.user.findMany.mock.calls[0][0].where).toEqual({
      OR: [
        { isRootBanned: true },
        {
          profiles: {
            some: {
              suspendedUntil: { gt: new Date('2026-10-19T00:00:00.000Z') },
            },
          },
        },
      ],
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
