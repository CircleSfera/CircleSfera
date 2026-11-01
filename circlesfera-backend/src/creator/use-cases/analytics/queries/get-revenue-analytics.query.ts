import { Inject, Injectable } from '@nestjs/common';
import { keptWithoutVat } from '../../../../monetization/paid-amounts.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';

@Injectable()
export class GetRevenueAnalyticsQuery {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // Income is kept by person (Transaction.receiverId is a User.id);
  // followers by Profile. Sums are made in cents and answered in euros.
  async execute(
    userId: string,
    profileId: string,
    period: '7d' | '30d' | '90d' | '1y' = '30d',
  ) {
    const daysMap = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
    const days = daysMap[period] || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [transactions, totalFollowersCount] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          receiverId: userId,
          status: 'COMPLETED',
          createdAt: { gte: startDate },
        },
        select: {
          type: true,
          amount: true,
          vatCents: true,
          refundedCents: true,
        },
      }),
      this.prisma.follow.count({
        where: { followingId: profileId, status: 'ACCEPTED' },
      }),
    ]);

    let tipsCents = 0;
    let postUnlocksCents = 0;
    let messageUnlocksCents = 0;
    let giftsCents = 0;

    for (const tx of transactions) {
      // What was paid without the VAT inside it, less what was refunded.
      const cents = Math.max(
        keptWithoutVat(tx.amount, tx.vatCents, tx.refundedCents),
        0,
      );
      if (tx.type === 'DIRECT_TIP') tipsCents += cents;
      else if (
        tx.type === 'DIRECT_POST_UNLOCK' ||
        tx.type === 'DIRECT_STORY_UNLOCK'
      )
        postUnlocksCents += cents;
      else if (tx.type === 'DIRECT_MESSAGE_UNLOCK')
        messageUnlocksCents += cents;
      else if (tx.type === 'DIRECT_LIVE_GIFT') giftsCents += cents;
    }

    const euros = (cents: number) => cents / 100;

    return {
      period,
      grossRevenue: euros(
        tipsCents + postUnlocksCents + messageUnlocksCents + giftsCents,
      ),
      tipsTotal: euros(tipsCents),
      postUnlocksTotal: euros(postUnlocksCents),
      messageUnlocksTotal: euros(messageUnlocksCents),
      giftsTotal: euros(giftsCents),
      totalFollowersCount,
      currency: 'EUR',
    };
  }
}
