import { describe, expect, it } from 'vitest';
import { activeMuteWhere, muteExpiresAtFromDuration } from './mute.util.js';

describe('mute.util', () => {
  const now = new Date('2026-09-05T12:00:00.000Z');

  it('maps durations to expiresAt (forever → null)', () => {
    expect(muteExpiresAtFromDuration('forever', now)).toBeNull();
    expect(muteExpiresAtFromDuration(undefined, now)).toBeNull();
    expect(muteExpiresAtFromDuration('24h', now)?.toISOString()).toBe(
      '2026-09-06T12:00:00.000Z',
    );
    expect(muteExpiresAtFromDuration('7d', now)?.toISOString()).toBe(
      '2026-09-12T12:00:00.000Z',
    );
    expect(muteExpiresAtFromDuration('30d', now)?.toISOString()).toBe(
      '2026-10-05T12:00:00.000Z',
    );
  });

  it('activeMuteWhere includes null and future expiresAt', () => {
    expect(activeMuteWhere('p1', now)).toEqual({
      muterId: 'p1',
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    });
  });
});
