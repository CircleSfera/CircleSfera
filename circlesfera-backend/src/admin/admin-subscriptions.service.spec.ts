import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminSubscriptionsService } from './admin-subscriptions.service.js';

// The staff list of platform plan subscriptions: what each filter asks the
// database for and what a row carries.
describe('AdminSubscriptionsService', () => {
  const prisma = {
    platformSubscription: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };
  let service: AdminSubscriptionsService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.platformSubscription.findMany.mockResolvedValue([]);
    prisma.platformSubscription.count.mockResolvedValue(0);
    service = new AdminSubscriptionsService(prisma as never);
  });

  const query = () => prisma.platformSubscription.findMany.mock.calls[0][0];

  it('lists every subscription, newest first, when no filter is given', async () => {
    await service.getSubscriptions();

    expect(query().where).toEqual({});
    expect(query().orderBy).toEqual({ createdAt: 'desc' });
    expect(query().skip).toBe(0);
    expect(query().take).toBe(20);
  });

  it('filters by state and plan', async () => {
    await service.getSubscriptions(1, 20, {
      status: 'PAST_DUE',
      planId: 'plan-1',
    });

    expect(query().where).toEqual({ status: 'PAST_DUE', planId: 'plan-1' });
  });

  it('searches by the email of the holder or the username of the profile', async () => {
    await service.getSubscriptions(1, 20, { search: '  ana ' });

    expect(query().where).toEqual({
      OR: [
        { user: { email: { contains: 'ana', mode: 'insensitive' } } },
        { profile: { username: { contains: 'ana', mode: 'insensitive' } } },
      ],
    });
  });

  it('counts with the same filter and reports the pages', async () => {
    prisma.platformSubscription.count.mockResolvedValue(45);

    const result = await service.getSubscriptions(3, 20, {
      status: 'ACTIVE',
    });

    expect(prisma.platformSubscription.count).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
    });
    expect(query().skip).toBe(40);
    expect(result.meta).toEqual({
      total: 45,
      page: 3,
      limit: 20,
      totalPages: 3,
    });
  });

  it('reads no payment detail beyond the provider reference of the subscription', async () => {
    await service.getSubscriptions();

    const { select } = query();
    expect(Object.keys(select.user.select)).toEqual(['id', 'email']);
    expect(Object.keys(select.plan.select)).not.toContain('stripePriceId');
    expect(Object.keys(select.plan.select)).not.toContain('stripeProductId');
  });
});
