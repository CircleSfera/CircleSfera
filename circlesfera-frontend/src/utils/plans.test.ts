import { describe, expect, it } from 'vitest';
import {
  hasElitePlan,
  isAddOnPlan,
  planFitsProfile,
  studioProState,
} from './plans';

describe('Edits Studio Pro', () => {
  it('is the add-on as the plan says, whatever its name', () => {
    expect(isAddOnPlan({ addOn: true })).toBe(true);
    expect(isAddOnPlan({ addOn: false })).toBe(false);
    expect(isAddOnPlan(undefined)).toBe(false);
  });

  it('is held while its subscription runs or waits on a failed renewal, included with a plan that has it, or neither', () => {
    expect(
      studioProState({
        studioPro: {
          includedInPlan: false,
          subscription: { status: 'ACTIVE' },
        },
      }),
    ).toBe('held');
    expect(
      studioProState({
        studioPro: { subscription: { status: 'TRIALING' } },
      }),
    ).toBe('held');
    expect(
      studioProState({
        studioPro: { includedInPlan: true, subscription: null },
      }),
    ).toBe('included');
    expect(
      studioProState({
        studioPro: { subscription: { status: 'PAST_DUE' } },
      }),
    ).toBe('held');
    // Left unpaid: paid in the billing portal, never bought again.
    expect(
      studioProState({
        studioPro: { subscription: { status: 'UNPAID' } },
      }),
    ).toBe('held');
    expect(studioProState(undefined)).toBe('none');
  });
});

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
  // The type of profile each plan is for, as the catalog sets it.
  it.each([
    [null, 'PERSONAL', true],
    [null, 'CREATOR', true],
    [null, 'BUSINESS', true],
    ['CREATOR', 'CREATOR', true],
    ['CREATOR', 'PERSONAL', false],
    ['CREATOR', 'BUSINESS', false],
    ['BUSINESS', 'BUSINESS', true],
    ['BUSINESS', 'CREATOR', false],
    ['BUSINESS', undefined, false],
  ] as const)(
    'a plan for %s fits a %s profile: %s',
    (forAccountType, type, fits) => {
      expect(planFitsProfile({ forAccountType }, type)).toBe(fits);
    },
  );

  it('reads the elite benefits from the level of the profile', () => {
    expect(hasElitePlan('ELITE')).toBe(true);
    expect(hasElitePlan('BUSINESS')).toBe(true);
    expect(hasElitePlan('VERIFIED')).toBe(false);
    expect(hasElitePlan(undefined)).toBe(false);
  });
});
