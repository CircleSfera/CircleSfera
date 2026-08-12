import { Inject, Injectable } from '@nestjs/common';
import { GetAudienceRetentionQuery } from '../queries/get-audience-retention.query.js';
import { GetRevenueAnalyticsQuery } from '../queries/get-revenue-analytics.query.js';

@Injectable()
export class ExportAnalyticsCsvUseCase {
  constructor(
    @Inject(GetRevenueAnalyticsQuery)
    private readonly getRevenueAnalytics: GetRevenueAnalyticsQuery,
    @Inject(GetAudienceRetentionQuery)
    private readonly getAudienceRetention: GetAudienceRetentionQuery,
  ) {}

  async execute(userId: string, period = '30d'): Promise<string> {
    const revenue = await this.getRevenueAnalytics.execute(
      userId,
      period as '7d' | '30d' | '90d' | '1y',
    );
    const retention = await this.getAudienceRetention.execute(userId);

    const rows = [
      ['Metric', 'Value', 'Unit/Currency'],
      ['Period', revenue.period, ''],
      ['Gross Revenue', revenue.grossRevenue.toFixed(2), revenue.currency],
      [
        'Subscriptions Revenue',
        revenue.subscriptionsTotal.toFixed(2),
        revenue.currency,
      ],
      ['Tips Revenue', revenue.tipsTotal.toFixed(2), revenue.currency],
      [
        'Post Unlocks Revenue',
        revenue.postUnlocksTotal.toFixed(2),
        revenue.currency,
      ],
      ['Gifts Revenue', revenue.giftsTotal.toFixed(2), revenue.currency],
      ['Active Subscribers', revenue.activeSubscribersCount, 'users'],
      ['Total Followers', revenue.totalFollowersCount, 'users'],
      ['Subscriber Conversion Rate', `${revenue.conversionRate}%`, 'percent'],
      ['Average Dwell Time', retention.avgDwellSeconds, 'seconds'],
      ['Peak Activity Hour', `${retention.peakActivityHourUTC}:00 UTC`, 'hour'],
    ];

    return rows.map((r) => r.join(',')).join('\n');
  }
}
