import { describe, expect, it, vi } from 'vitest';
import { isPremiumPostLocked } from './premium-post.policy.js';

const db = (unlocked: boolean) =>
  ({
    profile: {
      findUnique: vi.fn().mockResolvedValue({ userId: 'person-1' }),
    },
    postUnlock: {
      findUnique: vi.fn().mockResolvedValue(unlocked ? { id: 'u' } : null),
    },
  }) as never;

const paid = { id: 'p', isPremium: true, profileId: 'author' };

describe('isPremiumPostLocked', () => {
  it('never closes a post that is not paid', async () => {
    expect(
      await isPremiumPostLocked(db(false), { ...paid, isPremium: false }, 'v'),
    ).toBe(false);
  });

  it('closes a paid post to whoever has not unlocked it, signed in or not', async () => {
    expect(await isPremiumPostLocked(db(false), paid, 'viewer')).toBe(true);
    expect(await isPremiumPostLocked(db(false), paid, undefined)).toBe(true);
  });

  it('opens it to its author and to whoever unlocked it', async () => {
    expect(await isPremiumPostLocked(db(false), paid, 'author')).toBe(false);
    expect(await isPremiumPostLocked(db(true), paid, 'viewer')).toBe(false);
  });

  it('keeps it closed to a viewer whose Profile is not found', async () => {
    const missing = {
      profile: { findUnique: vi.fn().mockResolvedValue(null) },
      postUnlock: { findUnique: vi.fn() },
    } as never;
    expect(await isPremiumPostLocked(missing, paid, 'ghost')).toBe(true);
  });
});
