import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { GetAudienceRetentionQuery } from '../queries/get-audience-retention.query.js';

// The periods the export names; anything else is read as the default.
const PERIODS = ['7d', '30d', '90d', '1y'] as const;

@Injectable()
export class ExportAnalyticsCsvUseCase {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(GetAudienceRetentionQuery)
    private readonly getAudienceRetention: GetAudienceRetentionQuery,
  ) {}

  // The Profile's analytics as a spreadsheet: its followers and how its
  // audience watches. Followers are counted by Profile.id.
  async execute(profileId: string, period = '30d'): Promise<string> {
    const [totalFollowers, retention] = await Promise.all([
      this.prisma.follow.count({
        where: { followingId: profileId, status: 'ACCEPTED' },
      }),
      this.getAudienceRetention.execute(profileId),
    ]);

    const rows = [
      ['Metric', 'Value', 'Unit'],
      [
        'Period',
        (PERIODS as readonly string[]).includes(period) ? period : '30d',
        '',
      ],
      ['Total Followers', totalFollowers, 'users'],
      ['Average Dwell Time', retention.avgDwellSeconds, 'seconds'],
      ['Peak Activity Hour', `${retention.peakActivityHourUTC}:00 UTC`, 'hour'],
    ];

    return rows.map((r) => r.join(',')).join('\n');
  }
}
