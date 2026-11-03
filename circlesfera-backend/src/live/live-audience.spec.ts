import { describe, expect, it, vi } from 'vitest';
import {
  canEnterStreamRoom,
  canWatchStream,
  listedForViewer,
} from './live-audience.js';

vi.mock('../common/policies/block.policy.js', () => ({
  isBlockedEitherWay: vi.fn(async (_p, a: string, b: string) =>
    [a, b].includes('blocked'),
  ),
}));

const host = 'host';
const guest = 'guest';
const stream = (audience: 'EVERYONE' | 'CLOSE_FRIENDS' | 'PRACTICE') => ({
  id: 'live-1',
  hostId: host,
  audience,
});

type Status = 'INVITED' | 'ON_AIR' | 'DECLINED' | 'LEFT' | 'REMOVED';

/**
 * A close friends list that holds only `friend`; the guests of live-1 (by
 * default `guest`, invited); and the blocks between Profiles, as
 * [blocker, blocked].
 */
const prisma = (
  options: {
    friend?: string;
    guests?: [string, Status][];
    blocks?: [string, string][];
  } = {},
) => {
  const {
    friend = 'friend',
    guests = [[guest, 'INVITED']],
    blocks = [],
  } = options;
  const findUnique = vi.fn(
    async ({
      where,
    }: {
      where: { profileId_friendId: { friendId: string } };
    }) => (where.profileId_friendId.friendId === friend ? { id: 'cf' } : null),
  );
  const findMany = vi.fn(
    async ({
      where,
    }: {
      where: { streamId: string; status: { in: string[] } };
    }) =>
      where.streamId === 'live-1'
        ? guests
            .filter(([, status]) => where.status.in.includes(status))
            .map(([profileId, status]) => ({ profileId, status }))
        : [],
  );
  const findFirst = vi.fn(
    async ({
      where,
    }: {
      where: {
        OR: [
          { blockerId: string; blockedId: { in: string[] } },
          { blockedId: string; blockerId: { in: string[] } },
        ];
      };
    }) => {
      const [byViewer, ofViewer] = where.OR;
      const hit = blocks.some(
        ([blocker, blocked]) =>
          (blocker === byViewer.blockerId &&
            byViewer.blockedId.in.includes(blocked)) ||
          (blocked === ofViewer.blockedId &&
            ofViewer.blockerId.in.includes(blocker)),
      );
      return hit ? { id: 'b' } : null;
    },
  );
  return {
    closeFriend: { findUnique },
    liveGuest: { findMany },
    block: { findFirst },
  } as unknown as Parameters<typeof canWatchStream>[0] & {
    closeFriend: { findUnique: typeof findUnique };
    liveGuest: { findMany: typeof findMany };
    block: { findFirst: typeof findFirst };
  };
};

describe('who a live is for', () => {
  it('everyone: any viewer, signed in or not', async () => {
    for (const viewer of ['someone', undefined]) {
      expect(await canWatchStream(prisma(), stream('EVERYONE'), viewer)).toBe(
        true,
      );
    }
  });

  it('close friends: only the people on the host list', async () => {
    const db = prisma();
    expect(await canWatchStream(db, stream('CLOSE_FRIENDS'), 'friend')).toBe(
      true,
    );
    expect(await canWatchStream(db, stream('CLOSE_FRIENDS'), 'other')).toBe(
      false,
    );
    expect(await canWatchStream(db, stream('CLOSE_FRIENDS'), undefined)).toBe(
      false,
    );
    expect(db.closeFriend.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { profileId_friendId: { profileId: host, friendId: 'other' } },
      }),
    );
  });

  it('practice: nobody but the host and the guests, close friends neither', async () => {
    const db = prisma();
    expect(await canWatchStream(db, stream('PRACTICE'), 'friend')).toBe(false);
    expect(await canWatchStream(db, stream('PRACTICE'), undefined)).toBe(false);
    expect(db.closeFriend.findUnique).not.toHaveBeenCalled();
  });

  it('a guest who declined, left or was removed sees a practice no more', async () => {
    for (const status of ['DECLINED', 'LEFT', 'REMOVED'] as const) {
      const db = prisma({ guests: [[guest, status]] });
      expect(await canWatchStream(db, stream('PRACTICE'), guest)).toBe(false);
    }
  });

  it('the host and a guest invited or on air always see their own live', async () => {
    for (const audience of ['EVERYONE', 'CLOSE_FRIENDS', 'PRACTICE'] as const) {
      for (const status of ['INVITED', 'ON_AIR'] as const) {
        for (const viewer of [host, guest]) {
          const db = prisma({ guests: [[guest, status]] });
          expect(await canWatchStream(db, stream(audience), viewer)).toBe(true);
        }
      }
    }
  });

  it('lists lives for everyone, for close friends to them, and their own; never a practice of others', () => {
    expect(listedForViewer(undefined)).toEqual({ audience: 'EVERYONE' });
    expect(listedForViewer('v')).toEqual({
      OR: [
        {
          OR: [
            { audience: 'EVERYONE' },
            {
              audience: 'CLOSE_FRIENDS',
              host: { closeFriends: { some: { friendId: 'v' } } },
            },
          ],
        },
        { hostId: 'v' },
        {
          guests: {
            some: { profileId: 'v', status: { in: ['INVITED', 'ON_AIR'] } },
          },
        },
      ],
    });
  });
});

describe('a guest on air in a block with the viewer', () => {
  const onAir = (blocks: [string, string][], also: [string, Status][] = []) =>
    prisma({ guests: [[guest, 'ON_AIR'], ...also], blocks });

  it('hides the live from a viewer the guest blocked, whatever its audience', async () => {
    for (const audience of ['EVERYONE', 'CLOSE_FRIENDS'] as const) {
      const db = onAir([[guest, 'friend']]);
      expect(await canWatchStream(db, stream(audience), 'friend')).toBe(false);
    }
  });

  it('hides the live from a viewer who blocked the guest', async () => {
    const db = onAir([['viewer', guest]]);
    expect(await canWatchStream(db, stream('EVERYONE'), 'viewer')).toBe(false);
    expect(db.block.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { blockerId: 'viewer', blockedId: { in: [guest] } },
          { blockedId: 'viewer', blockerId: { in: [guest] } },
        ],
      },
      select: { id: true },
    });
  });

  it('a guest only invited hides nothing', async () => {
    const db = prisma({
      guests: [[guest, 'INVITED']],
      blocks: [[guest, 'viewer']],
    });
    expect(await canWatchStream(db, stream('EVERYONE'), 'viewer')).toBe(true);
    expect(db.block.findFirst).not.toHaveBeenCalled();
  });

  it('leaves the host, the other guests and anyone else as they are', async () => {
    const db = onAir(
      [
        [guest, host],
        [guest, 'other-guest'],
      ],
      [['other-guest', 'ON_AIR']],
    );
    expect(await canWatchStream(db, stream('EVERYONE'), host)).toBe(true);
    expect(await canWatchStream(db, stream('EVERYONE'), 'other-guest')).toBe(
      true,
    );
    expect(await canWatchStream(db, stream('EVERYONE'), 'someone')).toBe(true);
    // Nobody signed in has any block.
    expect(await canWatchStream(db, stream('EVERYONE'), undefined)).toBe(true);
  });

  it('leaves out of the list the lives with a guest on air in a block with the viewer, but never their own', () => {
    expect(listedForViewer('v', ['g1', 'g2'])).toEqual({
      OR: [
        {
          OR: [
            { audience: 'EVERYONE' },
            {
              audience: 'CLOSE_FRIENDS',
              host: { closeFriends: { some: { friendId: 'v' } } },
            },
          ],
          NOT: {
            guests: {
              some: { status: 'ON_AIR', profileId: { in: ['g1', 'g2'] } },
            },
          },
        },
        { hostId: 'v' },
        {
          guests: {
            some: { profileId: 'v', status: { in: ['INVITED', 'ON_AIR'] } },
          },
        },
      ],
    });
  });
});

describe('the room of a live', () => {
  const shownHost = {
    isAccountBanned: false,
    suspendedUntil: null,
    user: { isActive: true, deactivatedAt: null },
  };
  const db = (found: unknown, options: Parameters<typeof prisma>[0] = {}) => ({
    ...prisma(options),
    liveStream: { findUnique: vi.fn().mockResolvedValue(found) },
  });
  const live = (over: Record<string, unknown> = {}) => ({
    id: 'live-1',
    status: 'LIVE',
    hostId: host,
    audience: 'EVERYONE',
    host: shownHost,
    ...over,
  });

  it('lets in whoever may watch a live on air', async () => {
    expect(await canEnterStreamRoom(db(live()) as never, 's', 'v')).toBe(true);
  });

  it('keeps out of a live that is missing, ended, or whose host may not be seen', async () => {
    for (const found of [
      null,
      live({ status: 'ENDED' }),
      live({ host: { ...shownHost, isAccountBanned: true } }),
    ]) {
      expect(await canEnterStreamRoom(db(found) as never, 's', 'v')).toBe(
        false,
      );
    }
  });

  it('keeps out someone in a block with the host, and whoever it is not for', async () => {
    expect(await canEnterStreamRoom(db(live()) as never, 's', 'blocked')).toBe(
      false,
    );
    expect(
      await canEnterStreamRoom(
        db(live({ audience: 'PRACTICE' })) as never,
        's',
        'v',
      ),
    ).toBe(false);
  });

  it('keeps out someone in a block with a guest on air', async () => {
    const options = {
      guests: [[guest, 'ON_AIR']] as [string, Status][],
      blocks: [['v', guest]] as [string, string][],
    };
    expect(
      await canEnterStreamRoom(db(live(), options) as never, 'live-1', 'v'),
    ).toBe(false);
  });

  it('lets a guest invited or on air into the room of a practice', async () => {
    expect(
      await canEnterStreamRoom(
        db(live({ audience: 'PRACTICE' })) as never,
        'live-1',
        guest,
      ),
    ).toBe(true);
  });
});
