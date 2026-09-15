import { describe, expect, it } from 'vitest';
import type { ProfileWithUser } from '../../types';

/**
 * Profile API returns `_count` on the profile root (profiles.service),
 * not under `user`. UI must read `profile._count`, otherwise stats stay at 0.
 */
function postsStat(profile: ProfileWithUser): number {
  return profile._count?.posts || 0;
}

describe('profile posts count path', () => {
  it('reads posts from profile._count, not user._count', () => {
    const profile = {
      id: 'p1',
      userId: 'u1',
      username: 'SophiaStyle',
      fullName: 'Sophia',
      bio: null,
      avatar: null,
      standardUrl: null,
      thumbnailUrl: null,
      website: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      user: { id: 'u1', email: 's@example.com', createdAt: '2026-01-01' },
      _count: { posts: 2, followers: 5, following: 1 },
    } as ProfileWithUser;

    expect(postsStat(profile)).toBe(2);
    expect(
      (profile.user as { _count?: unknown } | undefined)?._count,
    ).toBeUndefined();
  });
});
