import { Inject, Injectable } from '@nestjs/common';
import { NOT_REMOVED } from '../../../../common/policies/removed-content.policy.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';

@Injectable()
export class GetCreatorStoriesQuery {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(profileId: string, page = 1, limit = 10) {
    // What moderation removed is kept six months, shown to nobody, its
    // author included.
    const where = { profileId, ...NOT_REMOVED };
    const [data, total] = await Promise.all([
      this.prisma.story.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          url: true,
          mediaType: true,
          expiresAt: true,
          createdAt: true,
          _count: { select: { views: true, reactions: true } },
        },
      }),
      this.prisma.story.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
