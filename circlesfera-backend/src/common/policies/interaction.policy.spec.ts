import { describe, expect, it, vi } from 'vitest';
import { allowedTargets } from './interaction.policy.js';

const dbWith = (
  profiles: Record<string, unknown>[],
  followers: string[] = [],
) =>
  ({
    profile: { findMany: vi.fn().mockResolvedValue(profiles) },
    follow: {
      findMany: vi
        .fn()
        .mockResolvedValue(followers.map((followerId) => ({ followerId }))),
    },
  }) as any;

describe('interaction policy', () => {
  it('asks nothing when nobody is named', async () => {
    const db = dbWith([]);
    await expect(allowedTargets(db, 'me', [], 'mention')).resolves.toEqual(
      new Map(),
    );
    expect(db.profile.findMany).not.toHaveBeenCalled();
  });

  it('lets everyone through who allows everyone, and nobody who allows nobody', async () => {
    const db = dbWith([
      { id: 'open', mentionsFrom: 'EVERYONE', manualTagApproval: false },
      { id: 'closed', mentionsFrom: 'NOBODY', manualTagApproval: false },
    ]);
    const allowed = await allowedTargets(
      db,
      'me',
      ['open', 'closed', 'open'],
      'mention',
    );
    expect([...allowed.keys()]).toEqual(['open']);
    expect(db.profile.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['open', 'closed'] } },
      select: { id: true, mentionsFrom: true, manualTagApproval: true },
    });
    // Nobody asked to follow the actor, so no follow is read.
    expect(db.follow.findMany).not.toHaveBeenCalled();
  });

  it('lets through those who follow the actor, with an accepted follow, when they allow only them', async () => {
    const db = dbWith(
      [
        { id: 'fan', tagsFrom: 'FOLLOWING', manualTagApproval: true },
        { id: 'stranger', tagsFrom: 'FOLLOWING', manualTagApproval: false },
      ],
      ['fan'],
    );
    const allowed = await allowedTargets(db, 'me', ['fan', 'stranger'], 'tag');
    expect(db.profile.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['fan', 'stranger'] } },
      select: { id: true, tagsFrom: true, manualTagApproval: true },
    });
    expect(db.follow.findMany).toHaveBeenCalledWith({
      where: {
        followerId: { in: ['fan', 'stranger'] },
        followingId: 'me',
        status: 'ACCEPTED',
      },
      select: { followerId: true },
    });
    expect(allowed).toEqual(new Map([['fan', { manualTagApproval: true }]]));
  });

  it('always lets the actor name itself, never waiting for its own approval', async () => {
    const db = dbWith([
      { id: 'me', tagsFrom: 'NOBODY', manualTagApproval: true },
    ]);
    await expect(allowedTargets(db, 'me', ['me'], 'tag')).resolves.toEqual(
      new Map([['me', { manualTagApproval: false }]]),
    );
  });

  it('leaves out a Profile that no longer exists', async () => {
    const db = dbWith([]);
    await expect(
      allowedTargets(db, 'me', ['gone'], 'mention'),
    ).resolves.toEqual(new Map());
  });
});
