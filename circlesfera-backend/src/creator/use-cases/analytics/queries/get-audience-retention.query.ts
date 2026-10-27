import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';

@Injectable()
export class GetAudienceRetentionQuery {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(profileId: string) {
    const posts = await this.prisma.post.findMany({
      where: { profileId, deletedAt: null },
      select: { id: true, performanceScore: true, views: true },
    });

    const postIds = posts.map((p) => p.id);

    const events =
      postIds.length > 0
        ? await this.prisma.interactionEvent.findMany({
            where: {
              targetId: { in: postIds },
              targetType: 'POST',
              dwellTime: { not: null },
            },
            select: { dwellTime: true, createdAt: true },
            take: 500,
          })
        : [];

    // Dwell is stored in milliseconds; the answer is in seconds.
    const totalDwellMs = events.reduce((sum, e) => sum + (e.dwellTime || 0), 0);
    const avgDwellSeconds =
      events.length > 0 ? Math.round(totalDwellMs / events.length / 1000) : 0;

    const hourlyMap = new Array(24).fill(0);
    for (const e of events) {
      const hour = new Date(e.createdAt).getUTCHours();
      hourlyMap[hour] += 1;
    }

    const peakHour = hourlyMap.indexOf(Math.max(...hourlyMap));

    return {
      avgDwellSeconds,
      totalInteractionsSampled: events.length,
      peakActivityHourUTC: peakHour,
      hourlyDistribution: hourlyMap,
    };
  }
}
