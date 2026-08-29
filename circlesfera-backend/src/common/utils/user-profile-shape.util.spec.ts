import { describe, expect, it } from 'vitest';
import { toAdminUser, withPrimaryProfile } from './user-profile-shape.util.js';

describe('user-profile-shape.util', () => {
  it('toAdminUser maps profile fields for content tabs', () => {
    expect(
      toAdminUser({ username: 'alice', avatar: 'https://cdn/a.png' }),
    ).toEqual({
      profile: { username: 'alice', avatar: 'https://cdn/a.png' },
    });
    expect(toAdminUser(null)).toBeNull();
  });

  it('toAdminUser maps Profile reporter rows for admin report UIs', () => {
    expect(
      toAdminUser({ username: 'reporter', avatar: null, fullName: 'Rep' }),
    ).toEqual({
      profile: { username: 'reporter', avatar: null, fullName: 'Rep' },
    });
  });

  it('withPrimaryProfile flattens profiles[0] for account-backed rows', () => {
    expect(
      withPrimaryProfile({
        id: 'u1',
        email: 'a@b.com',
        profiles: [{ username: 'alice', avatar: null, fullName: 'Alice' }],
      }),
    ).toEqual({
      id: 'u1',
      email: 'a@b.com',
      profile: { username: 'alice', avatar: null, fullName: 'Alice' },
    });
  });
});
