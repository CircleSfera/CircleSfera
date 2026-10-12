import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUsersService } from './admin-users.service.js';

// The role of an account gives no staff access: the change of role cannot
// make an operator, and does not touch the operators there are.
describe('AdminUsersService: account role', () => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    adminIdentity: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
    profile: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const cache = { del: vi.fn().mockResolvedValue(undefined) };
  let service: AdminUsersService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.user.update.mockResolvedValue({ id: 'user-1', role: 'USER' });
    service = new AdminUsersService(
      prisma as never,
      {} as never,
      {} as never,
      cache as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it.each(['ADMIN', 'MODERATOR', 'SUPPORT', 'FINANCE', 'SUPER_ADMIN', ''])(
    'refuses the role %j and changes nothing',
    async (role) => {
      await expect(
        service.updateUserRole('admin-1', 'user-1', role),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.adminIdentity.create).not.toHaveBeenCalled();
      expect(prisma.adminIdentity.update).not.toHaveBeenCalled();
      expect(prisma.adminIdentity.updateMany).not.toHaveBeenCalled();
    },
  );

  it('returns an account to the plain role without touching any operator', async () => {
    await service.updateUserRole('admin-1', 'user-1', 'USER');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { role: 'USER' },
    });
    expect(prisma.adminIdentity.create).not.toHaveBeenCalled();
    expect(prisma.adminIdentity.update).not.toHaveBeenCalled();
    expect(prisma.adminIdentity.updateMany).not.toHaveBeenCalled();
  });

  it('says so when the account does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.updateUserRole('admin-1', 'missing', 'USER'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
