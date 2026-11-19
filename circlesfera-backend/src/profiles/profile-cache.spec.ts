import { describe, expect, it, vi } from 'vitest';
import { forgetCachedProfiles, profileCacheKey } from './profile-cache.js';

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
});
