import { describe, expect, it } from 'vitest';
import {
  activeStrikeRecordWhere,
  activeStrikeWhere,
  STRIKE_EXPIRY_DAYS,
  STRIKES_TO_BAN,
  STRIKES_TO_SUSPEND,
  strikeExpiresAt,
  suspensionEndsAt,
} from './profile-strikes.constants.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('profile strike policy', () => {
  it('matches the owner decision: 90-day expiry, suspension at 2, ban at 3', () => {
    expect(STRIKE_EXPIRY_DAYS).toBe(90);
    expect(STRIKES_TO_SUSPEND).toBe(2);
    expect(STRIKES_TO_BAN).toBe(3);
  });

  it('each record expires 90 days after it is applied', () => {
    const appliedAt = new Date('2026-01-01T00:00:00.000Z');
    expect(strikeExpiresAt(appliedAt).getTime() - appliedAt.getTime()).toBe(
      90 * DAY_MS,
    );
  });

  it('a suspension lasts 7 days', () => {
    const appliedAt = new Date('2026-01-01T00:00:00.000Z');
    expect(suspensionEndsAt(appliedAt).getTime() - appliedAt.getTime()).toBe(
      7 * DAY_MS,
    );
  });

  it('active records are not revoked and not expired; warnings never count as strikes', () => {
    const now = new Date('2026-05-01T00:00:00.000Z');
    expect(activeStrikeRecordWhere(now)).toEqual({
      revokedAt: null,
      expiresAt: { gt: now },
    });
    expect(activeStrikeWhere(now)).toEqual({
      revokedAt: null,
      expiresAt: { gt: now },
      kind: 'STRIKE',
    });
  });
});
