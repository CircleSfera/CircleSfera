import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUsersService } from './admin-users.service.js';

// A compromised account is signed out everywhere without being sanctioned.
describe('AdminUsersService: the sessions of an account', () => {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    refreshToken: { count: vi.fn(), deleteMany: vi.fn() },
    adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const events = { emit: vi.fn() };
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
      events as never,
    );
  });

  it('counts the sessions that can still be renewed', async () => {
    prisma.refreshToken.count.mockResolvedValue(3);

    await expect(service.countOpenSessions('user-1')).resolves.toEqual({
      open: 3,
    });
    const { where } = prisma.refreshToken.count.mock.calls[0][0];
    expect(where).toMatchObject({ userId: 'user-1', isRevoked: false });
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it('deletes every session, ends the open connections of each profile and writes it down', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      profiles: [{ id: 'p1' }, { id: 'p2' }],
    });
    // Five rows are stored and four can still be renewed: four are closed.
    prisma.refreshToken.count.mockResolvedValue(4);
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 5 });

    await expect(
      service.closeUserSessions('admin-1', 'user-1'),
    ).resolves.toEqual({ closed: 4 });

    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(
      events.emit.mock.calls.map(([name, event]) => [name, event.profileId]),
    ).toEqual([
      ['user.session.terminate', 'p1'],
      ['user.session.terminate', 'p2'],
    ]);
    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        adminId: 'admin-1',
        action: 'MANUAL_OVERRIDE',
        targetType: 'user',
        targetId: 'user-1',
        details: 'Closed 4 sessions',
      },
    });
    // It is not a sanction: the account is not touched.
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('closes nothing for an account that does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.closeUserSessions('admin-1', 'gone'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });
});
