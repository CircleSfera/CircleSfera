import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUsersService } from './admin-users.service.js';

// Accounts that share a device or an IP with another are shown to staff as
// one cluster. The list shows the newest 50; the size of the cluster, which
// staff read and the trust score weighs, counts every one of them.
describe('AdminUsersService: linked accounts', () => {
  const prisma = {
    user: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  };
  const when = new Date('2026-03-10T11:00:00Z');
  let service: AdminUsersService;

  const linkedAccount = (id: string) => ({
    id,
    createdAt: when,
    signIns: [{ emailVerified: true }],
    identityVerifiedAt: null,
    botLabeledAt: null,
    isActive: true,
    profiles: [
      {
        username: `user_${id}`,
        fullName: null,
        avatar: null,
        _count: { strikes: 1 },
      },
    ],
  });

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

  it('counts the whole cluster when it is larger than the list shown', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      signupIpHash: 'ip-a',
      lastIpHash: null,
      deviceSignals: [{ visitorHash: 'dev-a' }],
    });
    prisma.user.findMany.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => linkedAccount(`u${i}`)),
    );
    prisma.user.count.mockResolvedValue(120);

    const result = await service.getLinkedAccounts('user-1');

    expect(result.clusterSize).toBe(121);
    expect(result.accounts).toHaveLength(50);
    expect(result.accounts[0]).toEqual({
      id: 'u0',
      username: 'user_u0',
      fullName: null,
      avatar: null,
      createdAt: when,
      emailConfirmed: true,
      identityVerified: false,
      botLabeled: false,
      strikeCount: 1,
      isActive: true,
    });
    // The count reads the same accounts as the list, without its limit.
    const listWhere = prisma.user.findMany.mock.calls[0][0].where;
    expect(prisma.user.count).toHaveBeenCalledWith({ where: listWhere });
    expect(listWhere.id).toEqual({ not: 'user-1' });
  });

  it('is a cluster of one when the account has no IP or device to compare', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      signupIpHash: null,
      lastIpHash: null,
      deviceSignals: [],
    });
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await expect(service.getLinkedAccounts('user-1')).resolves.toEqual({
      clusterSize: 1,
      accounts: [],
    });
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { id: { in: [] } },
    });
  });

  it('refuses an account that does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.getLinkedAccounts('missing')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
