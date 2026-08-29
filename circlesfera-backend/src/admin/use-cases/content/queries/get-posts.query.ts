import { Inject, Injectable } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service.js';
import { toAdminUser } from '../../../utils/admin-user-shape.util.js';

@Injectable()
export class GetPostsQuery {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(
    page = 1,
    limit = 10,
    search?: string,
    type?: string,
    userId?: string,
    moderationStatus?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.PostWhereInput = {};

    // Admin UI passes platform User.id; posts are owned by Profile.
    if (userId) {
      where.profile = { userId };
    }
    if (search?.trim()) {
      where.OR = [
        { caption: { contains: search.trim(), mode: 'insensitive' } },
        { location: { contains: search.trim(), mode: 'insensitive' } },
        {
          profile: {
            username: { contains: search.trim(), mode: 'insensitive' },
          },
        },
      ];
    }

    if (type === 'POST' || type === 'FRAME') {
      where.type = type;
    }

    if (
      moderationStatus &&
      ['VISIBLE', 'FLAGGED', 'HIDDEN', 'REMOVED'].includes(moderationStatus)
    ) {
      where.moderationStatus = moderationStatus as $Enums.ModerationStatus;
    }

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          profile: {
            select: { id: true, username: true, avatar: true },
          },
          media: true,
          _count: { select: { likes: true, comments: true } },
        },
      }),
      this.prisma.post.count({ where }),
    ]);

    // Preserve AdminPost shape: post.user.profile.username
    const data = posts.map(({ profile, ...rest }) => ({
      ...rest,
      profile,
      user: toAdminUser(profile),
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
