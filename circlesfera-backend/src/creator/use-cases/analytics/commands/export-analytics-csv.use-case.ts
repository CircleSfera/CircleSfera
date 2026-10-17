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

  async execute(
    userId: string,
    profileId: string,
    period = '30d',
  ): Promise<string> {
    // Transaction (revenue) is keyed by User.id; Post/Story (retention) by
    // Profile.id — these are distinct UUID spaces, so both ids are required.
    const revenue = await this.getRevenueAnalytics.execute(
      userId,
      profileId,
      period as '7d' | '30d' | '90d' | '1y',
    );
    const retention = await this.getAudienceRetention.execute(profileId);

    const rows = [
      ['Metric', 'Value', 'Unit/Currency'],
      ['Period', revenue.period, ''],
      ['Gross Revenue', revenue.grossRevenue.toFixed(2), revenue.currency],
      ['Tips Revenue', revenue.tipsTotal.toFixed(2), revenue.currency],
      [
        'Post Unlocks Revenue',
        revenue.postUnlocksTotal.toFixed(2),
        revenue.currency,
      ],
      [
        'Message Unlocks Revenue',
        revenue.messageUnlocksTotal.toFixed(2),
        revenue.currency,
      ],
      ['Gifts Revenue', revenue.giftsTotal.toFixed(2), revenue.currency],
      ['Total Followers', revenue.totalFollowersCount, 'users'],
      ['Average Dwell Time', retention.avgDwellSeconds, 'seconds'],
      ['Peak Activity Hour', `${retention.peakActivityHourUTC}:00 UTC`, 'hour'],
    ];

    return rows.map((r) => r.join(',')).join('\n');
  }
}
