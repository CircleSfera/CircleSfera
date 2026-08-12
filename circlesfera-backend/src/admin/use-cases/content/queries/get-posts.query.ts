import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service.js';

@Injectable()
export class GetPostsQuery {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(page = 1, limit = 10, search?: string, type?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.PostWhereInput = {};

    if (search) {
      where.OR = [
        { caption: { contains: search, mode: 'insensitive' } },
        {
          user: {
            profile: {
              username: { contains: search, mode: 'insensitive' },
            },
          },
        },
      ];
    }

    if (type === 'POST' || type === 'FRAME') {
      where.type = type;
    }

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { include: { profile: true } },
          media: true,
          _count: { select: { likes: true, comments: true } },
        },
      }),
      this.prisma.post.count({ where }),
    ]);

    return {
      data: posts,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
