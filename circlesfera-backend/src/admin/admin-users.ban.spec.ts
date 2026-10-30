import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUsersService } from './admin-users.service.js';

// A person banned from the whole account from the Admin Panel is paid out
// nothing while the ban lasts; lifting it brings the payouts back.
describe('AdminUsersService: payouts of a banned person', () => {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    profile: { updateMany: vi.fn(), findMany: vi.fn() },
    refreshToken: { deleteMany: vi.fn() },
    adminAuditLog: { create: vi.fn() },
  };
  const usersService = { holdPayouts: vi.fn() };
  const email = { sendAccountBannedEmail: vi.fn() };
  const cache = { del: vi.fn() };
  const events = { emit: vi.fn() };
  let service: AdminUsersService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', profiles: [] });
    prisma.user.update.mockResolvedValue({
      id: 'u1',
      email: null,
      profiles: [{ id: 'p1', username: 'ana' }],
    });
    prisma.profile.findMany.mockResolvedValue([]);
    service = new AdminUsersService(
      prisma as never,
      email as never,
      {} as never,
      cache as never,
      usersService as never,
      {} as never,
      events as never,
    );
  });

  it('holds the payouts of the person banned', async () => {
    await service.banUser('admin-1', 'u1');

    expect(usersService.holdPayouts).toHaveBeenCalledWith('u1', true);
  });

  it('resumes them when the ban is lifted', async () => {
    await service.unbanUser('admin-1', 'u1');

    expect(usersService.holdPayouts).toHaveBeenCalledWith('u1', false);
  });

  it('ends the sessions and logs the ban even when the hold fails', async () => {
    usersService.holdPayouts.mockRejectedValueOnce(new Error('provider down'));

    await expect(service.banUser('admin-1', 'u1')).rejects.toThrow(
      'provider down',
    );

    expect(events.emit).toHaveBeenCalledWith(
      'user.session.terminate',
      expect.objectContaining({ userId: 'u1' }),
    );
    expect(prisma.adminAuditLog.create).toHaveBeenCalled();
  });
});
