import { Inject, Injectable } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service.js';

@Injectable()
export class GetLiveStreamsQuery {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(page = 1, limit = 20, status?: string, userId?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.LiveStreamWhereInput = {};
    if (status && ['LIVE', 'ENDED'].includes(status)) {
      where.status = status as $Enums.LiveStatus;
    }
    // Admin UI passes platform User.id; LiveStream.host is a Profile.
    if (userId) {
      where.host = { userId };
    }

    const [streams, total] = await Promise.all([
      this.prisma.liveStream.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startedAt: 'desc' },
        include: {
          host: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
          coHost: {
            select: {
              id: true,
              username: true,
              avatar: true,
            },
          },
        },
      }),
      this.prisma.liveStream.count({ where }),
    ]);

    // Preserve AdminLiveStream shape: host.profile.username
    const data = streams.map((stream) => ({
      ...stream,
      host: stream.host
        ? {
            id: stream.host.id,
            profile: {
              username: stream.host.username,
              avatar: stream.host.avatar,
            },
          }
        : null,
      coHost: stream.coHost
        ? {
            id: stream.coHost.id,
            profile: {
              username: stream.coHost.username,
              avatar: stream.coHost.avatar,
            },
          }
        : null,
    }));

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
