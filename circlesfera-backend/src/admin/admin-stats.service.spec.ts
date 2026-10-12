import { describe, expect, it, vi } from 'vitest';
import { AdminStatsService } from './admin-stats.service.js';

const realAccount = { isTestAccount: false };
const realContent = { profile: { user: realAccount } };

function build() {
  const count = () => vi.fn().mockResolvedValue(0);
  const prisma = {
    user: { count: count(), findMany: vi.fn().mockResolvedValue([]) },
    post: { count: count(), findMany: vi.fn().mockResolvedValue([]) },
    story: { count: count(), findMany: vi.fn().mockResolvedValue([]) },
    report: { count: count(), findMany: vi.fn().mockResolvedValue([]) },
    like: { count: count() },
    comment: { count: count() },
    adminAuditLog: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const cache = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
  };
  const service = new AdminStatsService(prisma as never, cache as never);
  return { service, prisma };
}

describe('AdminStatsService excludes Test Accounts', () => {
  it('counts only real accounts and their content on the dashboard', async () => {
    const { service, prisma } = build();

    await service.getDashboardStats();

    expect(prisma.user.count).toHaveBeenCalledWith({ where: realAccount });
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { ...realAccount, isActive: true },
    });
    expect(prisma.post.count).toHaveBeenCalledWith({ where: realContent });
  });

  it('applies the same exclusion to every enhanced metric', async () => {
    const { service, prisma } = build();

    await service.getEnhancedStats();

    for (const call of prisma.user.count.mock.calls) {
      expect(call[0].where).toMatchObject(realAccount);
    }
    for (const delegate of [
      prisma.post.count,
      prisma.story.count,
      prisma.like.count,
      prisma.comment.count,
    ]) {
      for (const call of delegate.mock.calls) {
        expect(call[0].where).toMatchObject(realContent);
      }
    }
  });

  it('charts only real accounts and their content', async () => {
    const { service, prisma } = build();

    await service.getActivityChart(7);

    expect(prisma.user.findMany.mock.calls[0][0].where).toMatchObject(
      realAccount,
    );
    expect(prisma.post.findMany.mock.calls[0][0].where).toMatchObject(
      realContent,
    );
    expect(prisma.story.findMany.mock.calls[0][0].where).toMatchObject(
      realContent,
    );
  });
});

describe('AdminStatsService monetization tiers', () => {
  it('counts the €9.99 plan as Premium under its current and former name', async () => {
    const { service, prisma } = build();
    const plan = (name: string, priceCents: number) => ({
      plan: { name, priceCents },
    });
    (prisma as Record<string, unknown>).platformSubscription = {
      findMany: vi
        .fn()
        .mockResolvedValue([
          plan('Premium', 999),
          plan('Verified', 999),
          plan('Elite Creator', 1999),
          plan('Business', 4999),
        ]),
      count: vi.fn().mockResolvedValue(0),
    };

    const result = await service.getMonetizationAnalytics();

    expect(result.tierDistribution).toEqual({
      PREMIUM: 2,
      ELITE: 1,
      BUSINESS: 1,
    });
  });
});

describe('AdminStatsService: the audit log by staff member and by account', () => {
  it('asks for exactly what a staff member did and what was done to an account', async () => {
    const prisma = {
      adminAuditLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'l1',
            action: 'BAN_USER',
            targetType: 'user',
            targetId: 'account-1',
            details: null,
            createdAt: new Date('2026-03-10T11:00:00Z'),
            adminId: 'staff-1',
            admin: { displayName: 'Ana Staff', email: 'ana@staff.test' },
          },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    const service = new AdminStatsService(prisma as never, {} as never);

    const page = await service.getAuditLogs(1, 20, {
      adminId: 'staff-1',
      targetId: 'account-1',
      action: 'BAN_USER',
    });

    const where = {
      adminId: 'staff-1',
      targetId: 'account-1',
      action: 'BAN_USER',
    };
    expect(prisma.adminAuditLog.findMany.mock.calls[0][0].where).toEqual(where);
    expect(prisma.adminAuditLog.count).toHaveBeenCalledWith({ where });
    expect(page.data[0]).toMatchObject({
      adminId: 'staff-1',
      adminUsername: 'Ana Staff',
      targetId: 'account-1',
    });
  });

  it('asks for the whole log when no filter is given', async () => {
    const prisma = {
      adminAuditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const service = new AdminStatsService(prisma as never, {} as never);

    await service.getAuditLogs();

    expect(prisma.adminAuditLog.findMany.mock.calls[0][0].where).toEqual({});
  });
});
