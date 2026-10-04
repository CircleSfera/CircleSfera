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
