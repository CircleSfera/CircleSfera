import { describe, expect, it, vi } from 'vitest';
import {
  primaryProfileIdForUser,
  toAdminUser,
  withPrimaryProfile,
} from './user-profile-shape.util.js';

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

  it('primaryProfileIdForUser returns the first profile id', async () => {
    const prisma = {
      profile: {
        findFirst: vi.fn().mockResolvedValue({ id: 'profile-1' }),
      },
    };
    await expect(
      primaryProfileIdForUser(prisma as never, 'user-1'),
    ).resolves.toBe('profile-1');
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
