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

/**
 * A close friends list that holds only `friend`, and `guest` invited to or on
 * air in live-1 (a guest with a place).
 */
const prisma = (friend = 'friend') => {
  const findUnique = vi.fn(
    async ({
      where,
    }: {
      where: { profileId_friendId: { friendId: string } };
    }) => (where.profileId_friendId.friendId === friend ? { id: 'cf' } : null),
  );
  const findFirst = vi.fn(
    async ({
      where,
    }: {
      where: { streamId: string; profileId: string; status: { in: string[] } };
    }) =>
      where.streamId === 'live-1' &&
      where.profileId === guest &&
      where.status.in.includes('INVITED') &&
      where.status.in.includes('ON_AIR')
        ? { id: 'g' }
        : null,
  );
  return {
    closeFriend: { findUnique },
    liveGuest: { findFirst },
  } as unknown as Parameters<typeof canWatchStream>[0] & {
    closeFriend: { findUnique: typeof findUnique };
    liveGuest: { findFirst: typeof findFirst };
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

  it('practice: nobody but the host and the guest, close friends neither', async () => {
    const db = prisma();
    expect(await canWatchStream(db, stream('PRACTICE'), 'friend')).toBe(false);
    expect(await canWatchStream(db, stream('PRACTICE'), undefined)).toBe(false);
    expect(db.closeFriend.findUnique).not.toHaveBeenCalled();
  });

  it('a live for everyone asks nobody whether the viewer is a guest', async () => {
    const db = prisma();
    expect(await canWatchStream(db, stream('EVERYONE'), 'someone')).toBe(true);
    expect(db.liveGuest.findFirst).not.toHaveBeenCalled();
  });

  it('a guest who declined, left or was removed sees a practice no more', async () => {
    const db = prisma();
    db.liveGuest.findFirst.mockResolvedValueOnce(null);
    expect(await canWatchStream(db, stream('PRACTICE'), guest)).toBe(false);
  });

  it('the host and a guest invited or on air always see their own live', async () => {
    for (const audience of ['EVERYONE', 'CLOSE_FRIENDS', 'PRACTICE'] as const) {
      for (const viewer of [host, guest]) {
        expect(await canWatchStream(prisma(), stream(audience), viewer)).toBe(
          true,
        );
      }
    }
  });

  it('lists lives for everyone, for close friends to them, and their own; never a practice of others', () => {
    expect(listedForViewer(undefined)).toEqual({ audience: 'EVERYONE' });
    expect(listedForViewer('v')).toEqual({
      OR: [
        { audience: 'EVERYONE' },
        {
          audience: 'CLOSE_FRIENDS',
          host: { closeFriends: { some: { friendId: 'v' } } },
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
  const db = (found: unknown) => ({
    ...prisma(),
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
