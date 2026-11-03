import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../../prisma/prisma.service.js';
import { GetLiveStreamsQuery } from './get-live-streams.query.js';

describe('GetLiveStreamsQuery', () => {
  const guest = (profileId: string, status: string) => ({
    profileId,
    status,
    profile: { username: `${profileId}_name`, avatar: null },
  });
  const setup = (rows: unknown[]) => {
    const prisma = {
      liveStream: {
        findMany: vi.fn().mockResolvedValue(rows),
        count: vi.fn().mockResolvedValue(rows.length),
      },
    };
    return {
      prisma,
      query: new GetLiveStreamsQuery(prisma as unknown as PrismaService),
    };
  };

  it("answers each live's guests, and the first on air as the co-host the admin screen shows", async () => {
    const { prisma, query } = setup([
      {
        id: 'live-1',
        coHostId: 'stale-column',
        host: { id: 'host-1', username: 'host', avatar: 'h.jpg' },
        guests: [guest('ana', 'ON_AIR'), guest('bea', 'INVITED')],
      },
    ]);

    const result = await query.execute(1, 20, 'LIVE', 'user-1');

    const [args] = prisma.liveStream.findMany.mock.calls[0];
    expect(args.where).toEqual({ status: 'LIVE', host: { userId: 'user-1' } });
    expect(args.include.guests.where).toEqual({
      status: { in: ['INVITED', 'ON_AIR'] },
    });
    expect(result.data).toEqual([
      {
        id: 'live-1',
        host: { id: 'host-1', profile: { username: 'host', avatar: 'h.jpg' } },
        guests: [
          {
            profileId: 'ana',
            username: 'ana_name',
            avatar: null,
            status: 'ON_AIR',
          },
          {
            profileId: 'bea',
            username: 'bea_name',
            avatar: null,
            status: 'INVITED',
          },
        ],
        coHostId: 'ana',
        coHost: { id: 'ana', profile: { username: 'ana_name', avatar: null } },
      },
    ]);
    expect(result.meta).toEqual({
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  it('shows no co-host while nobody is on air, and no host once it is gone', async () => {
    const { prisma, query } = setup([
      { id: 'live-1', host: null, guests: [guest('bea', 'INVITED')] },
    ]);

    const result = await query.execute(2, 10, 'ANY');

    expect(prisma.liveStream.findMany.mock.calls[0][0]).toMatchObject({
      where: {},
      skip: 10,
      take: 10,
    });
    expect(result.data[0]).toMatchObject({
      host: null,
      coHostId: null,
      coHost: null,
    });
  });
});
