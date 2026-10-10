import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

// Platform plan subscriptions for staff. Read only: the payment provider is
// where a subscription is changed, cancelled or refunded.
@Injectable()
export class AdminSubscriptionsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getSubscriptions(
    page = 1,
    limit = 20,
    filters: {
      status?: SubscriptionStatus;
      planId?: string;
      search?: string;
    } = {},
  ) {
    const search = filters.search?.trim();
    const where: Prisma.PlatformSubscriptionWhereInput = {
      ...(filters.status && { status: filters.status }),
      ...(filters.planId && { planId: filters.planId }),
      ...(search && {
        OR: [
          { user: { email: { contains: search, mode: 'insensitive' } } },
          { profile: { username: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [subscriptions, total] = await Promise.all([
      this.prisma.platformSubscription.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          stripeSubscriptionId: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
          createdAt: true,
          plan: {
            select: { id: true, name: true, priceCents: true, currency: true },
          },
          profile: {
            select: { id: true, username: true, fullName: true, avatar: true },
          },
          user: { select: { id: true, email: true } },
        },
      }),
      this.prisma.platformSubscription.count({ where }),
    ]);

    return {
      data: subscriptions,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
