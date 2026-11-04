import { describe, expect, it, vi } from 'vitest';
import {
  publicPostListWhere,
  withLikeCountAsSeenBy,
} from './public-post-list.policy.js';

const prisma = (blocks: Array<{ blockerId: string; blockedId: string }>) => ({
  block: { findMany: vi.fn().mockResolvedValue(blocks) },
});

describe('the posts a viewer may find in a public list', () => {
  const PUBLIC = {
    visibility: 'PUBLIC',
    moderationStatus: 'VISIBLE',
    deletedAt: null,
    archivedAt: null,
    profile: { privacyLevel: 'PUBLIC' },
  };

  it('are public posts of public Profiles for someone signed out', async () => {
    const db = prisma([]);
    await expect(publicPostListWhere(db as never)).resolves.toEqual(PUBLIC);
    expect(db.block.findMany).not.toHaveBeenCalled();
  });

  it('leave out everyone across a block either way, and add the viewer own', async () => {
    const where = await publicPostListWhere(
      prisma([
        { blockerId: 'me', blockedId: 'a' },
        { blockerId: 'b', blockedId: 'me' },
      ]) as never,
      'me',
    );
    const [others, own] = where.OR as Array<Record<string, unknown>>;
    expect(others).toEqual({ ...PUBLIC, profileId: { notIn: ['a', 'b'] } });
    expect(own).toMatchObject({ profileId: 'me', archivedAt: null });
  });

  it('name no block filter when there is none', async () => {
    const where = await publicPostListWhere(prisma([]) as never, 'me');
    expect((where.OR as Array<Record<string, unknown>>)[0]).toEqual(PUBLIC);
  });
});

describe('a like count the author hid', () => {
  const post = {
    profileId: 'author',
    hideLikes: true,
    _count: { likes: 4, comments: 2 },
  };

  it('is left out for everyone but the author', () => {
    expect(withLikeCountAsSeenBy(post, 'viewer')._count).toEqual({
      likes: null,
      comments: 2,
    });
    expect(withLikeCountAsSeenBy(post, null)._count?.likes).toBeNull();
    expect(withLikeCountAsSeenBy(post, 'author')).toBe(post);
  });

  it('changes nothing on a post that shows it, or with no counts', () => {
    const shown = { ...post, hideLikes: false };
    expect(withLikeCountAsSeenBy(shown, 'viewer')).toBe(shown);
    const bare = { profileId: 'author', hideLikes: true };
    expect(withLikeCountAsSeenBy(bare, 'viewer')).toBe(bare);
  });
});
