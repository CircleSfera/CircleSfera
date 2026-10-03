import { describe, expect, it } from 'vitest';
import { isProfileUsable, pickSessionProfile } from './session-profile.util.js';

const NOW = new Date('2030-01-01T00:00:00Z');
const FUTURE = new Date('2030-02-01T00:00:00Z');
const PAST = new Date('2029-12-01T00:00:00Z');

const ok = (id: string) => ({
  id,
  isAccountBanned: false,
  suspendedUntil: null,
});
const banned = (id: string) => ({
  id,
  isAccountBanned: true,
  suspendedUntil: null,
});
const suspended = (id: string, until: Date) => ({
  id,
  isAccountBanned: false,
  suspendedUntil: until,
});

describe('isProfileUsable', () => {
  it('rejects banned and currently suspended Profiles only', () => {
    expect(isProfileUsable(ok('a'), NOW)).toBe(true);
    expect(isProfileUsable(banned('a'), NOW)).toBe(false);
    expect(isProfileUsable(suspended('a', FUTURE), NOW)).toBe(false);
    expect(isProfileUsable(suspended('a', PAST), NOW)).toBe(true);
  });
});

describe('pickSessionProfile', () => {
  it('signs in with the oldest usable Profile when the first one is banned', () => {
    expect(
      pickSessionProfile(
        [banned('a'), suspended('b', FUTURE), ok('c')],
        null,
        NOW,
      )?.id,
    ).toBe('c');
  });

  it('returns the oldest Profile when none is usable, so the caller can refuse', () => {
    expect(pickSessionProfile([banned('a'), banned('b')], null, NOW)?.id).toBe(
      'a',
    );
  });

  it('keeps a session bound to its Profile even if that Profile is banned', () => {
    expect(pickSessionProfile([ok('a'), banned('b')], 'b', NOW)?.id).toBe('b');
  });

  it('falls back to the default choice if the bound Profile is gone', () => {
    expect(pickSessionProfile([banned('a'), ok('b')], 'gone', NOW)?.id).toBe(
      'b',
    );
  });

  it('returns undefined for an account without Profiles', () => {
    expect(pickSessionProfile([], null, NOW)).toBeUndefined();
  });
});
