import { describe, expect, it } from 'vitest';
import {
  accessEndOf,
  isReviewerRoleSet,
  reviewerAccessDays,
  switchRole,
  toDateField,
} from './operatorAccess';

const REVIEWER = 'arole_external_reviewer';

describe('operator access', () => {
  it('a reviewer holds that role alone', () => {
    expect(isReviewerRoleSet([REVIEWER])).toBe(true);
    expect(isReviewerRoleSet([REVIEWER, 'arole_support'])).toBe(false);
    expect(isReviewerRoleSet(['arole_support'])).toBe(false);
  });

  it('choosing the reviewer role leaves it alone, choosing another drops it', () => {
    expect(switchRole(['arole_support', 'arole_content'], REVIEWER)).toEqual([
      REVIEWER,
    ]);
    expect(switchRole([REVIEWER], 'arole_support')).toEqual(['arole_support']);
    expect(switchRole(['arole_support'], 'arole_content')).toEqual([
      'arole_support',
      'arole_content',
    ]);
    expect(
      switchRole(['arole_support', 'arole_content'], 'arole_support'),
    ).toEqual(['arole_content']);
    // The last role is never switched off.
    expect(switchRole([REVIEWER], REVIEWER)).toEqual([REVIEWER]);
  });

  it('offers the days from tomorrow to 90 days ahead, 30 by default', () => {
    const now = new Date(2026, 10, 5, 15, 0).getTime();
    expect(reviewerAccessDays(now)).toEqual({
      min: '2026-11-06',
      max: '2027-02-03',
      initial: '2026-12-05',
    });
    expect(reviewerAccessDays().min).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(toDateField(new Date(2027, 0, 9))).toBe('2027-01-09');
  });

  it('ends access at the start of the day chosen, local time', () => {
    expect(accessEndOf('2026-12-05')).toBe(new Date(2026, 11, 5).toISOString());
    expect(accessEndOf('')).toBeNull();
    expect(accessEndOf('5/12/2026')).toBeNull();
  });
});
