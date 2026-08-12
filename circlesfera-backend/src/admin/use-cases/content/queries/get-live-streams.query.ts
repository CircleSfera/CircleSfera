import { Inject, Injectable } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service.js';

@Injectable()
export class GetLiveStreamsQuery {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(page = 1, limit = 20, status?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.LiveStreamWhereInput = {};
    if (status && ['LIVE', 'ENDED'].includes(status)) {
      where.status = status as $Enums.LiveStatus;
    }

    const [data, total] = await Promise.all([
      this.prisma.liveStream.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startedAt: 'desc' },
        include: {
          host: {
            select: {
              id: true,
              profile: { select: { username: true, avatar: true } },
            },
          },
        },
      }),
      this.prisma.liveStream.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}
