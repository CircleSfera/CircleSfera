import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';

@Injectable()
export class GetCreatorStoriesQuery {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(profileId: string, page = 1, limit = 10) {
    const [data, total] = await Promise.all([
      this.prisma.story.findMany({
        where: { profileId },
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
      this.prisma.story.count({ where: { profileId } }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
