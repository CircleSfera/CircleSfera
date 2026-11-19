import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUsersService } from './admin-users.service.js';

// Staff ban, unban, suspend and restore an account: each one on an account
// that exists, its Profiles and the account changed together, and the cached
// public profile dropped so it does not show the state before.
describe('AdminUsersService: sanctions on an account', () => {
  const writes: string[] = [];
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    profile: {
      updateMany: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    refreshToken: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $queryRaw: vi.fn(),
    // A list of writes runs as one transaction; a function is the
    // transaction of deleteRefreshTokens.
    $transaction: vi.fn(async (run: unknown) => {
      if (Array.isArray(run)) return Promise.all(run);
      return (run as (tx: unknown) => unknown)(prisma);
    }),
    adminAuditLog: { create: vi.fn() },
  };
  const cache = { del: vi.fn() };
  const notifications = { create: vi.fn() };
  const email = { sendAccountBannedEmail: vi.fn() };
  const events = { emit: vi.fn() };
  let service: AdminUsersService;

  beforeEach(() => {
    vi.clearAllMocks();
    writes.length = 0;
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', profiles: [] });
    prisma.user.update.mockImplementation(async () => {
      writes.push('user');
      return { id: 'user-1', email: null, profiles: [{ id: 'p1' }] };
    });
    prisma.profile.updateMany.mockImplementation(async () => {
      writes.push('profiles');
      return { count: 1 };
    });
    prisma.profile.findMany.mockResolvedValue([{ username: 'ana' }]);
    prisma.profile.findFirst.mockResolvedValue({ id: 'p1' });
    prisma.refreshToken.findMany.mockResolvedValue([]);
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.adminAuditLog.create.mockResolvedValue({});
    notifications.create.mockResolvedValue({});
    service = new AdminUsersService(
      prisma as never,
      email as never,
      notifications as never,
      cache as never,
      {} as never,
      {} as never,
      events as never,
    );
  });

  const sanctions = {
    ban: () => service.banUser('admin-1', 'user-1'),
    unban: () => service.unbanUser('admin-1', 'user-1'),
    suspend: () => service.suspendUser('admin-1', 'user-1', 7, 'spam'),
    restore: () => service.restoreUser('admin-1', 'user-1'),
  };

  it.each(Object.entries(sanctions))(
    '%s on an account that does not exist is "not found", and changes nothing',
    async (_name, sanction) => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(sanction()).rejects.toBeInstanceOf(NotFoundException);

      expect(writes).toEqual([]);
      expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
    },
  );

  it.each(Object.entries(sanctions))(
    '%s changes the Profiles and the account in one transaction',
    async (_name, sanction) => {
      await sanction();

      const batch = prisma.$transaction.mock.calls.find(([run]) =>
        Array.isArray(run),
      );
      expect(batch?.[0]).toHaveLength(2);
      expect(writes).toEqual(['profiles', 'user']);
    },
  );

  it.each(Object.entries(sanctions))(
    '%s drops the cached public profile',
    async (_name, sanction) => {
      await sanction();

      expect(cache.del).toHaveBeenCalledWith('profile:ana');
    },
  );
});
