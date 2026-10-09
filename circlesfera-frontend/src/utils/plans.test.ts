import { describe, expect, it } from 'vitest';
import { hasElitePlan, planAccountType, planFitsProfile } from './plans';

describe('hasElitePlan', () => {
  it.each(['ELITE', 'BUSINESS'])('is true for %s', (level) => {
    expect(hasElitePlan(level)).toBe(true);
  });

  it.each(['BASIC', 'VERIFIED', null, undefined])(
    'is false for %s',
    (level) => {
      expect(hasElitePlan(level)).toBe(false);
    },
  );
});

describe('plans', () => {
  it('names the type of profile each plan is for from its name', () => {
    expect(planAccountType('Business')).toBe('BUSINESS');
    expect(planAccountType('Elite Creator')).toBe('CREATOR');
    expect(planAccountType('Premium')).toBeNull();
    expect(planAccountType('Verified')).toBeNull();
  });

  it.each([
    ['Premium', 'PERSONAL', true],
    ['Premium', 'CREATOR', true],
    ['Premium', 'BUSINESS', true],
    ['Elite Creator', 'CREATOR', true],
    ['Elite Creator', 'PERSONAL', false],
    ['Elite Creator', 'BUSINESS', false],
    ['Business', 'BUSINESS', true],
    ['Business', 'CREATOR', false],
    ['Business', undefined, false],
  ] as const)('%s for a %s profile: %s', (plan, type, fits) => {
    expect(planFitsProfile(plan, type)).toBe(fits);
  });

  it('reads the elite benefits from the level of the profile', () => {
    expect(hasElitePlan('ELITE')).toBe(true);
    expect(hasElitePlan('BUSINESS')).toBe(true);
    expect(hasElitePlan('VERIFIED')).toBe(false);
    expect(hasElitePlan(undefined)).toBe(false);
  });
});
