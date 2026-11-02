import { describe, expect, it, vi } from 'vitest';
import {
  blockedWithViewer,
  blocksAmong,
  maskedForViewer,
  maskParticipants,
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

describe('blocksAmong', () => {
  it('maps each member to those in a block with them, either way, in one query', async () => {
    const db = {
      block: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ blockerId: 'a', blockedId: 'b' }]),
      },
    };

    const pairs = await blocksAmong(db as never, ['a', 'b', 'c', 'a']);

    expect(db.block.findMany).toHaveBeenCalledWith({
      where: {
        blockerId: { in: ['a', 'b', 'c'] },
        blockedId: { in: ['a', 'b', 'c'] },
      },
      select: { blockerId: true, blockedId: true },
    });
    expect([...(pairs.get('a') ?? [])]).toEqual(['b']);
    expect([...(pairs.get('b') ?? [])]).toEqual(['a']);
    expect(pairs.get('c')).toBeUndefined();
  });

  it('asks nothing for fewer than two members', async () => {
    const db = { block: { findMany: vi.fn() } };
    expect((await blocksAmong(db as never, ['a', null])).size).toBe(0);
    expect(db.block.findMany).not.toHaveBeenCalled();
  });
});

describe('maskParticipants and maskedForViewer', () => {
  const conv = () => ({
    id: 'c',
    participants: [
      { profileId: 'me', profile: { id: 'me', username: 'me' } },
      { profileId: 'b', profile: { id: 'b', username: 'bob' } },
      { profileId: 'x', profile: null },
    ],
  });

  it('masks only the members in the set, and leaves the rest as they are', () => {
    const masked = maskParticipants(conv(), new Set(['b', 'x']));
    expect(masked.participants[1].profile).toEqual({
      id: 'b',
      username: null,
      unavailable: true,
    });
    expect(masked.participants[0].profile).toEqual({
      id: 'me',
      username: 'me',
    });
    expect(masked.participants[2].profile).toBeNull();
    const same = conv();
    expect(maskParticipants(same, undefined)).toBe(same);
    const none: { id: string; participants?: [] } = { id: 'c' };
    expect(maskParticipants(none, new Set(['b']))).toEqual({ id: 'c' });
  });

  it('masks a conversation for the viewer from their blocks', async () => {
    const none2: { id: string; participants?: [] } = { id: 'c' };
    const db = {
      block: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ blockerId: 'me', blockedId: 'b' }]),
      },
    };
    const masked = await maskedForViewer(db as never, 'me', conv());
    expect((masked.participants[1].profile as any).unavailable).toBe(true);
    expect(
      (await maskedForViewer(db as never, 'me', none2)).participants,
    ).toBeUndefined();
  });
});
