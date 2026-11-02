import { describe, expect, it, vi } from 'vitest';
import {
  blockedWithViewer,
  unavailableProfile,
} from './blocked-participants.js';

describe('blockedWithViewer', () => {
  it('finds the Profiles in a block with the viewer, either way, in one query', async () => {
    const db = {
      block: {
        findMany: vi.fn().mockResolvedValue([
          { blockerId: 'me', blockedId: 'b' },
          { blockerId: 'c', blockedId: 'me' },
        ]),
      },
    };

    const blocked = await blockedWithViewer(db as never, 'me', [
      'me',
      'b',
      'c',
      'd',
      'b',
      null,
    ]);

    expect([...blocked].sort()).toEqual(['b', 'c']);
    expect(db.block.findMany).toHaveBeenCalledTimes(1);
    expect(db.block.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { blockerId: 'me', blockedId: { in: ['b', 'c', 'd'] } },
          { blockedId: 'me', blockerId: { in: ['b', 'c', 'd'] } },
        ],
      },
      select: { blockerId: true, blockedId: true },
    });
  });

  it('asks nothing without a viewer or anyone else', async () => {
    const db = { block: { findMany: vi.fn() } };

    expect((await blockedWithViewer(db as never, undefined, ['b'])).size).toBe(
      0,
    );
    expect((await blockedWithViewer(db as never, 'me', ['me'])).size).toBe(0);
    expect(db.block.findMany).not.toHaveBeenCalled();
  });
});

describe('unavailableProfile', () => {
  it('keeps the id, drops name, handle and picture, and says so', () => {
    expect(
      unavailableProfile({
        id: 'b',
        username: 'bob',
        avatar: '/a.jpg',
        fullName: 'Bob',
      }),
    ).toEqual({
      id: 'b',
      username: null,
      avatar: null,
      fullName: null,
      unavailable: true,
    });
    expect(unavailableProfile({ username: 'bob' })).toEqual({
      username: null,
      unavailable: true,
    });
  });
});
