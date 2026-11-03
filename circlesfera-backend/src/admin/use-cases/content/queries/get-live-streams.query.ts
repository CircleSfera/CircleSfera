import { Inject, Injectable } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { GUEST_PLACE_STATUSES } from '../../../../live/live-guest.policy.js';
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
          // Guests invited or on air: those on air first, in the order
          // they went on air.
          guests: {
            where: { status: { in: [...GUEST_PLACE_STATUSES] } },
            select: {
              profileId: true,
              status: true,
              profile: { select: { username: true, avatar: true } },
            },
            orderBy: [
              { joinedAt: { sort: 'asc', nulls: 'last' } },
              { invitedAt: 'asc' },
            ],
          },
        },
      }),
      this.prisma.liveStream.count({ where }),
    ]);

    // Preserve AdminLiveStream shape: host.profile.username
    const data = streams.map(({ guests, ...stream }) => {
      const first = guests.find((guest) => guest.status === 'ON_AIR');
      return {
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
        guests: guests.map((guest) => ({
          profileId: guest.profileId,
          username: guest.profile.username,
          avatar: guest.profile.avatar,
          status: guest.status,
        })),
        // The first guest on air, as the one co-host the admin screen shows.
        coHostId: first?.profileId ?? null,
        coHost: first
          ? {
              id: first.profileId,
              profile: {
                username: first.profile.username,
                avatar: first.profile.avatar,
              },
            }
          : null,
      };
    });

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
