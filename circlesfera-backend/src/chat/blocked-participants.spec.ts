import { describe, expect, it, vi } from 'vitest';
import {
  blockedWithViewer,
  blocksAmong,
  idOnlyProfile,
  maskConversationFor,
  maskedForViewer,
  maskMessage,
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

describe('maskMessage', () => {
  const message = () => ({
    id: 'm',
    senderId: 'b',
    sender: { id: 'b', username: 'bob' },
    replyTo: { senderId: 'c', sender: { id: 'c', username: 'cat' } },
  });

  it('masks the sender and the quoted sender in a block with the member', () => {
    const masked = maskMessage(message(), new Set(['b', 'c']));
    expect(masked.sender).toEqual({
      id: 'b',
      username: null,
      unavailable: true,
    });
    expect(masked.replyTo?.sender).toEqual({
      id: 'c',
      username: null,
      unavailable: true,
    });
    // A quote naming its sender only by the sender's own id is masked too.
    const byId = maskMessage(
      { replyTo: { sender: { id: 'c', username: 'cat' } } },
      new Set(['c']),
    );
    expect(byId.replyTo?.sender).toMatchObject({ unavailable: true });
  });

  it('leaves the message as it is with no block, and keeps ids only when blocks are unknown', () => {
    const same = message();
    expect(maskMessage(same, new Set())).toBe(same);
    const unknown = maskMessage(message(), null);
    expect(unknown.sender).toEqual({ id: 'b' });
    expect(unknown.replyTo?.sender).toEqual({ id: 'c' });
    const plain: { id: string; sender?: null } = { id: 'x' };
    expect(maskMessage(plain, null)).toEqual({ id: 'x' });
    expect(maskMessage({ replyTo: null }, null)).toEqual({ replyTo: null });
  });
});

describe('maskConversationFor and idOnlyProfile', () => {
  it('masks as the member sees, or keeps ids only when blocks are unknown', () => {
    const conv = {
      participants: [
        { profileId: 'b', profile: { id: 'b', username: 'bob' } },
        { profileId: 'x', profile: null },
      ],
    };
    expect(
      maskConversationFor(conv, new Set(['b'])).participants?.[0].profile,
    ).toMatchObject({ unavailable: true });
    expect(maskConversationFor(conv, null).participants).toEqual([
      { profileId: 'b', profile: { id: 'b' } },
      { profileId: 'x', profile: null },
    ]);
    const none: { participants?: [] } = {};
    expect(maskConversationFor(none, null)).toBe(none);
    expect(idOnlyProfile({ username: 'z' })).toEqual({});
  });
});
