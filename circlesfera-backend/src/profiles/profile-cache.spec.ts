import { describe, expect, it, vi } from 'vitest';
import {
  forgetCachedProfiles,
  forgetCachedProfilesOf,
  profileCacheKey,
} from './profile-cache.js';

describe('the cached public profile', () => {
  it('has one key for a username in any case', () => {
    expect(profileCacheKey('Ana')).toBe('profile:ana');
    expect(profileCacheKey('ana')).toBe(profileCacheKey('ANA'));
  });

  it('drops the view of each username, in the case its read stored it', async () => {
    const cache = { del: vi.fn().mockResolvedValue(true) };

    await forgetCachedProfiles(cache, ['Ana', null, undefined, 'bob.shop']);

    expect(cache.del.mock.calls).toEqual([
      ['profile:ana'],
      ['profile:bob.shop'],
    ]);
  });

  it('never fails the write when the cache cannot be reached', async () => {
    const cache = {
      del: vi.fn().mockRejectedValue(new Error('cache unreachable')),
    };

    await expect(forgetCachedProfiles(cache, ['ana'])).resolves.toBeUndefined();
  });

  it('drops the view of every Profile of an account, or of a sign-in', async () => {
    const cache = { del: vi.fn().mockResolvedValue(true) };
    const db = {
      profile: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ username: 'Ana' }, { username: 'ana.shop' }]),
      },
    };

    await forgetCachedProfilesOf(db, cache, { userId: 'u-1' });
    await forgetCachedProfilesOf(db, cache, { signInId: 's-1' });

    expect(db.profile.findMany.mock.calls).toEqual([
      [{ where: { userId: 'u-1' }, select: { username: true } }],
      [{ where: { signInId: 's-1' }, select: { username: true } }],
    ]);
    expect(cache.del).toHaveBeenCalledWith('profile:ana');
    expect(cache.del).toHaveBeenCalledWith('profile:ana.shop');
  });

  it('never fails the write when the Profiles cannot be read', async () => {
    const cache = { del: vi.fn() };
    const db = {
      profile: { findMany: vi.fn().mockRejectedValue(new Error('db down')) },
    };

    await expect(
      forgetCachedProfilesOf(db, cache, { userId: 'u-1' }),
    ).resolves.toBeUndefined();
    expect(cache.del).not.toHaveBeenCalled();
  });
});
