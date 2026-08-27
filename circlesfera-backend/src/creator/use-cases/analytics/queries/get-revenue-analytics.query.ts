import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';

@Injectable()
export class GetRevenueAnalyticsQuery {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(
    profileId: string,
    period: '7d' | '30d' | '90d' | '1y' = '30d',
  ) {
    const daysMap = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
    const days = daysMap[period] || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [transactions, activeSubscribersCount, totalFollowersCount] =
      await Promise.all([
        this.prisma.transaction.findMany({
          where: {
            receiverId: profileId,
            status: 'COMPLETED',
            createdAt: { gte: startDate },
          },
        }),
        Promise.resolve(0), // creatorSubscription.count
        this.prisma.follow.count({
          where: { followingId: profileId, status: 'ACCEPTED' },
        }),
      ]);

    let subscriptionsTotal = 0;
    let tipsTotal = 0;
    let postUnlocksTotal = 0;
    let giftsTotal = 0;

    for (const tx of transactions) {
      const amountEur = tx.amount > 0 ? tx.amount / 100 : 0;
      if (tx.type === 'STRIPE_SUBSCRIPTION') subscriptionsTotal += amountEur;
      else if (tx.type === 'DIRECT_TIP') tipsTotal += amountEur;
      else if (
        tx.type === 'DIRECT_POST_UNLOCK' ||
        tx.type === 'DIRECT_STORY_UNLOCK'
      )
        postUnlocksTotal += amountEur;
      else if (tx.type === 'DIRECT_LIVE_GIFT') giftsTotal += amountEur;
    }

    const grossRevenue =
      subscriptionsTotal + tipsTotal + postUnlocksTotal + giftsTotal;
    const conversionRate =
      totalFollowersCount > 0
        ? Number(
            ((activeSubscribersCount / totalFollowersCount) * 100).toFixed(2),
          )
        : 0;

    return {
      period,
      grossRevenue,
      subscriptionsTotal,
      tipsTotal,
      postUnlocksTotal,
      giftsTotal,
      activeSubscribersCount,
      totalFollowersCount,
      conversionRate,
      currency: 'EUR',
    };
  }
}
