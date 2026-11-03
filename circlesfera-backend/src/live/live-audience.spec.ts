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
  hostId: host,
  coHostId: guest,
  audience,
});

/** A close friends list that holds only `friend`. */
const prisma = (friend = 'friend') => {
  const findUnique = vi.fn(
    async ({
      where,
    }: {
      where: { profileId_friendId: { friendId: string } };
    }) => (where.profileId_friendId.friendId === friend ? { id: 'cf' } : null),
  );
  // Only the close friends list is read here.
  return { closeFriend: { findUnique } } as unknown as Parameters<
    typeof canWatchStream
  >[0] & { closeFriend: { findUnique: typeof findUnique } };
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

  it('the host and the guest always see their own live', async () => {
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
        { coHostId: 'v' },
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
    status: 'LIVE',
    hostId: host,
    coHostId: null,
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
});
