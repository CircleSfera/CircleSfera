import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service.js';

@Injectable()
export class GetTopContentQuery {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(userId: string, limit = 5) {
    const topPosts = await this.prisma.post.findMany({
      where: { userId, type: 'POST' },
      take: limit,
      orderBy: { performanceScore: 'desc' },
      include: {
        media: { select: { url: true, type: true } },
        _count: { select: { likes: true, comments: true, bookmarks: true } },
      },
    });

    return topPosts.map((post) => ({
      id: post.id,
      caption: post.caption,
      views: post.views,
      performanceScore: post.performanceScore,
      likes: post._count.likes,
      comments: post._count.comments,
      bookmarks: post._count.bookmarks,
      thumbnailUrl: post.media[0]?.url || null,
      createdAt: post.createdAt,
    }));
  }
}
