import { describe, expect, it } from 'vitest';
import { APPEAL_WINDOW_MONTHS, appealDeadline } from './appeal-window.js';

describe('appealDeadline', () => {
  it('is six months after the decision', () => {
    expect(APPEAL_WINDOW_MONTHS).toBe(6);
    expect(appealDeadline(new Date('2026-03-15T10:00:00.000Z'))).toEqual(
      new Date('2026-09-15T10:00:00.000Z'),
    );
  });

  it('a decision on the last day of a long month ends on the last day of a short one', () => {
    expect(appealDeadline(new Date('2026-08-31T10:00:00.000Z'))).toEqual(
      new Date('2027-02-28T10:00:00.000Z'),
    );
  });

  it('crosses into the next year', () => {
    expect(appealDeadline(new Date('2026-10-17T00:00:00.000Z'))).toEqual(
      new Date('2027-04-17T00:00:00.000Z'),
    );
  });
});
