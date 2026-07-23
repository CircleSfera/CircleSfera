import { describe, expect, it } from 'vitest';
import { buildRedisCacheUrl } from './cache.module.js';

describe('buildRedisCacheUrl', () => {
  it('defaults to localhost:6379 with no auth when nothing is provided', () => {
    expect(buildRedisCacheUrl()).toBe('redis://localhost:6379');
  });

  it('builds a URL from a custom host and port without credentials', () => {
    expect(buildRedisCacheUrl('redis-host', 6380)).toBe(
      'redis://redis-host:6380',
    );
  });

  it('includes a password segment when a password is provided', () => {
    expect(buildRedisCacheUrl('redis-host', 6379, 'secret')).toBe(
      'redis://:secret@redis-host:6379',
    );
  });

  it('URL-encodes special characters in the password', () => {
    const url = buildRedisCacheUrl('localhost', 6379, 'p@ss:w/rd#1');
    expect(url).toBe(
      `redis://:${encodeURIComponent('p@ss:w/rd#1')}@localhost:6379`,
    );
    // Sanity check: the raw special characters must not leak unescaped.
    expect(url).not.toContain('p@ss:w/rd#1');
  });

  it('omits the auth segment entirely for an empty-string password', () => {
    expect(buildRedisCacheUrl('localhost', 6379, '')).toBe(
      'redis://localhost:6379',
    );
  });
});
