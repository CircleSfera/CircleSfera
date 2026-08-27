import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { GetCreatorStatsQuery } from '../../analytics/queries/get-creator-stats.query.js';

interface CreatorPost {
  id: string;
  caption: string | null;
  type: string;
  views: number;
  createdAt: Date;
  media: { url: string; type: string }[];
  _count: { likes: number; comments: number; bookmarks: number };
}

@Injectable()
export class GetCreatorPostsQuery {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(GetCreatorStatsQuery)
    private readonly getCreatorStats: GetCreatorStatsQuery,
  ) {}

  async execute(profileId: string, page = 1, limit = 10, type?: string) {
    const where = {
      profileId,
      ...(type ? { type: type as 'POST' | 'FRAME' } : {}),
    };

    const [stats, postsResult, total] = await Promise.all([
      this.getCreatorStats.execute(profileId),
      this.prisma.post.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          caption: true,
          type: true,
          views: true,
          createdAt: true,
          media: { take: 1, select: { url: true, type: true } },
          _count: {
            select: { likes: true, comments: true, bookmarks: true },
          },
        },
      }) as unknown as Promise<CreatorPost[]>,
      this.prisma.post.count({ where }),
    ]);

    const avgInteractions =
      (stats.totalLikes + stats.totalComments) /
      (stats.postCount + stats.frameCount || 1);

    const data = postsResult.map((post) => {
      const interactions =
        (post._count?.likes || 0) + (post._count?.comments || 0);

      const avg = avgInteractions > 0 ? avgInteractions : 0;
      const performanceScore =
        avg > 0 ? Math.round((interactions / avg) * 100) : 100;

      return {
        ...post,
        performanceScore,
      };
    });

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
