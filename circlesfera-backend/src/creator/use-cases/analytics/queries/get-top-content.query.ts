import { Inject, Injectable } from '@nestjs/common';
import {
  LISTED_POST,
  SHOWN_COMMENTS_COUNT,
} from '../../../../common/policies/removed-content.policy.js';
import { PrismaService } from '../../../../prisma/prisma.service.js';

@Injectable()
export class GetTopContentQuery {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(profileId: string, limit = 5) {
    const topPosts = await this.prisma.post.findMany({
      // What moderation removed is kept for its appeal, shown to nobody.
      where: { profileId, type: 'POST', ...LISTED_POST },
      take: limit,
      orderBy: { performanceScore: 'desc' },
      include: {
        media: { select: { url: true, type: true } },
        _count: {
          select: {
            likes: true,
            comments: SHOWN_COMMENTS_COUNT,
            bookmarks: true,
          },
        },
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
